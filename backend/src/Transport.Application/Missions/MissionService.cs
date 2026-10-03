using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Transport.Application.Common;
using Transport.Application.Interfaces;
using Transport.Domain.Entities;
using Transport.Domain.Enums;

namespace Transport.Application.Missions;

public interface IMissionService
{
    Task<PagedResult<MissionListItemDto>> ListAsync(MissionQuery q, CancellationToken ct, int? restrictToDriverId = null);
    Task<MissionDetailDto> GetAsync(int id, CancellationToken ct, int? restrictToDriverId = null);
    Task<MissionDetailDto?> FindByReferenceAsync(string referenceNumber, CancellationToken ct, int? restrictToDriverId = null);
    Task<MissionDetailDto> CreateAsync(MissionUpsertRequest r, CancellationToken ct);
    Task<MissionDetailDto> UpdateAsync(int id, MissionUpsertRequest r, CancellationToken ct);
    Task DeleteAsync(int id, CancellationToken ct);
    Task<MissionDetailDto> AssignAsync(int id, AssignMissionRequest r, CancellationToken ct);
    Task<MissionDetailDto> ChangeStatusAsync(int id, ChangeStatusRequest r, CancellationToken ct, int? restrictToDriverId = null);
    Task<IReadOnlyList<MissionTimelineItemDto>> GetTimelineAsync(int id, CancellationToken ct, int? restrictToDriverId = null);
    Task<IReadOnlyList<StatusDto>> GetStatusesAsync(CancellationToken ct);
    IQueryable<Mission> FilteredQuery(MissionQuery q, int? restrictToDriverId = null);
}

public class MissionService : IMissionService
{
    private readonly IApplicationDbContext _db;
    private readonly ICurrentUserService _current;
    private readonly IAuditService _audit;
    private readonly INotificationService _notifications;
    private readonly IValidator<MissionUpsertRequest> _upsertValidator;
    private readonly IValidator<AssignMissionRequest> _assignValidator;
    private readonly IValidator<ChangeStatusRequest> _statusValidator;

    public MissionService(IApplicationDbContext db, ICurrentUserService current, IAuditService audit,
        INotificationService notifications, IValidator<MissionUpsertRequest> upsertValidator,
        IValidator<AssignMissionRequest> assignValidator, IValidator<ChangeStatusRequest> statusValidator)
    {
        _db = db; _current = current; _audit = audit; _notifications = notifications;
        _upsertValidator = upsertValidator; _assignValidator = assignValidator; _statusValidator = statusValidator;
    }

    // ------------------------------------------------------------------ Lecture

    public IQueryable<Mission> FilteredQuery(MissionQuery q, int? restrictToDriverId = null)
    {
        var query = _db.Missions.AsNoTracking().Where(m => !m.IsDeleted);

        if (restrictToDriverId is { } driverOnly) query = query.Where(m => m.CurrentDriverId == driverOnly);
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(m => m.Reference.Number.Contains(s) || m.Client.Name.Contains(s)
                || m.PickupLocation.City.Contains(s) || m.DeliveryLocation.City.Contains(s)
                || (m.CurrentDriver != null && (m.CurrentDriver.LastName.Contains(s) || m.CurrentDriver.FirstName.Contains(s))));
        }
        if (!string.IsNullOrWhiteSpace(q.Status))
        {
            var statuses = q.Status.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            query = query.Where(m => statuses.Contains(m.CurrentStatus.Code));
        }
        if (q.ClientId is { } clientId) query = query.Where(m => m.ClientId == clientId);
        if (!string.IsNullOrWhiteSpace(q.Ids))
        {
            var ids = q.Ids.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(x => int.TryParse(x, out var v) ? v : 0).Where(v => v > 0).Take(500).ToList();
            query = query.Where(m => ids.Contains(m.Id));
        }
        if (q.DriverId is { } driverId) query = query.Where(m => m.CurrentDriverId == driverId);

        var (from, to) = ResolvePeriod(q);
        if (from is { } f) query = query.Where(m => m.PlannedDate >= f);
        if (to is { } t) query = query.Where(m => m.PlannedDate < t);
        return query;
    }

    private static (DateTime? from, DateTime? to) ResolvePeriod(MissionQuery q)
    {
        var today = DateTime.UtcNow.Date;
        return q.Period?.ToLowerInvariant() switch
        {
            "today" => (today, today.AddDays(1)),
            "week" => (today.AddDays(-(((int)today.DayOfWeek + 6) % 7)), today.AddDays(7 - (((int)today.DayOfWeek + 6) % 7))),
            "month" => (new DateTime(today.Year, today.Month, 1, 0, 0, 0, DateTimeKind.Utc), new DateTime(today.Year, today.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(1)),
            _ => (q.DateFrom?.Date, q.DateTo?.Date.AddDays(1)),
        };
    }

    public async Task<PagedResult<MissionListItemDto>> ListAsync(MissionQuery q, CancellationToken ct, int? restrictToDriverId = null)
    {
        var query = FilteredQuery(q, restrictToDriverId);
        query = (q.SortBy?.ToLowerInvariant()) switch
        {
            "reference" => query.OrderByDir(m => m.Reference.Number, q.Descending),
            "client" => query.OrderByDir(m => m.Client.Name, q.Descending),
            "status" => query.OrderByDir(m => m.CurrentStatus.SortOrder, q.Descending),
            "driver" => query.OrderByDir(m => m.CurrentDriver!.LastName, q.Descending),
            "lastaction" => query.OrderByDir(m => m.LastActionAt, q.DescendingOrDefault),
            "pickup" => query.OrderByDir(m => m.PickupLocation.City, q.Descending),
            "delivery" => query.OrderByDir(m => m.DeliveryLocation.City, q.Descending),
            _ => query.OrderByDir(m => m.PlannedDate, q.DescendingOrDefault),
        };

        return await query.Select(m => new MissionListItemDto(
                m.Id, m.Reference.Number, m.ClientId, m.Client.Name, m.PlannedDate,
                m.PickupLocation.City, m.DeliveryLocation.City,
                m.CurrentDriverId, m.CurrentDriver != null ? m.CurrentDriver.FirstName + " " + m.CurrentDriver.LastName : null,
                m.CurrentVehicle != null ? m.CurrentVehicle.PlateNumber : null,
                m.CurrentStatus.Code, m.CurrentStatus.Label, m.LastAction, m.LastActionAt))
            .ToPagedAsync(q, ct);
    }

    public async Task<MissionDetailDto> GetAsync(int id, CancellationToken ct, int? restrictToDriverId = null)
    {
        var mission = await LoadAsync(id, ct, tracking: false);
        EnsureDriverScope(mission, restrictToDriverId);
        return await ToDetailAsync(mission, ct);
    }

    public async Task<MissionDetailDto?> FindByReferenceAsync(string referenceNumber, CancellationToken ct, int? restrictToDriverId = null)
    {
        var number = referenceNumber.Trim();
        var id = await _db.Missions.Where(m => !m.IsDeleted && m.Reference.Number == number)
            .Select(m => (int?)m.Id).FirstOrDefaultAsync(ct);
        return id is null ? null : await GetAsync(id.Value, ct, restrictToDriverId);
    }

    public async Task<IReadOnlyList<StatusDto>> GetStatusesAsync(CancellationToken ct) =>
        await _db.MissionStatuses.AsNoTracking().OrderBy(s => s.SortOrder)
            .Select(s => new StatusDto(s.Code, s.Label)).ToListAsync(ct);

    public async Task<IReadOnlyList<MissionTimelineItemDto>> GetTimelineAsync(int id, CancellationToken ct, int? restrictToDriverId = null)
    {
        var mission = await _db.Missions.AsNoTracking().Include(m => m.Reference)
            .FirstOrDefaultAsync(m => m.Id == id && !m.IsDeleted, ct)
            ?? throw new NotFoundException("MISSION_NOT_FOUND", "La mission n'existe pas.");
        EnsureDriverScope(mission, restrictToDriverId);

        var items = new List<MissionTimelineItemDto>();

        var statuses = await _db.MissionStatusHistories.AsNoTracking().Where(h => h.MissionId == id)
            .Select(h => new { h.ChangedAt, h.Comment, From = h.FromStatus != null ? h.FromStatus.Label : null, ToLabel = h.ToStatus.Label, ToCode = h.ToStatus.Code, User = h.ChangedByUser.FirstName + " " + h.ChangedByUser.LastName })
            .ToListAsync(ct);
        items.AddRange(statuses.Select(h => new MissionTimelineItemDto(h.ChangedAt, h.From is null ? "CREATE" : "STATUS",
            h.From is null ? $"Mission {mission.Reference.Number} créée" : $"Statut : {h.ToLabel}",
            h.From is null ? h.Comment : (h.Comment ?? $"{h.From} → {h.ToLabel}"), h.User, h.ToCode)));

        var assignments = await _db.MissionAssignments.AsNoTracking().Where(a => a.MissionId == id)
            .Select(a => new { a.AssignedAt, a.Comment, Driver = a.Driver.FirstName + " " + a.Driver.LastName, Plate = a.Vehicle != null ? a.Vehicle.PlateNumber : null, User = a.AssignedByUser.FirstName + " " + a.AssignedByUser.LastName })
            .ToListAsync(ct);
        items.AddRange(assignments.Select(a => new MissionTimelineItemDto(a.AssignedAt, "ASSIGN", $"Affectée à {a.Driver}",
            string.Join(" · ", new[] { a.Plate is null ? null : $"Véhicule {a.Plate}", a.Comment }.Where(x => x != null)), a.User, null)));

        var docs = await _db.Documents.AsNoTracking().Where(d => d.MissionId == id)
            .Select(d => new { d.UploadedAt, d.FileName, d.IsDeleted, d.DeletedAt, Type = d.DocumentType.Label, User = d.UploadedByUser.FirstName + " " + d.UploadedByUser.LastName })
            .ToListAsync(ct);
        items.AddRange(docs.Select(d => new MissionTimelineItemDto(d.UploadedAt, "DOCUMENT", "Document ajouté", $"{d.Type} — {d.FileName}", d.User, null)));
        items.AddRange(docs.Where(d => d.IsDeleted && d.DeletedAt != null).Select(d => new MissionTimelineItemDto(d.DeletedAt!.Value, "DOCUMENT_DELETE", "Document supprimé", d.FileName, null, null)));

        var idStr = id.ToString();
        var updates = await _db.AuditLogs.AsNoTracking()
            .Where(a => a.EntityName == "Mission" && a.EntityId == idStr && a.Action == AuditActions.Update)
            .Select(a => new { a.CreatedAt, a.Description, User = a.User != null ? a.User.FirstName + " " + a.User.LastName : null })
            .ToListAsync(ct);
        items.AddRange(updates.Select(u => new MissionTimelineItemDto(u.CreatedAt, "UPDATE", "Mission modifiée", u.Description, u.User, null)));

        return items.OrderByDescending(i => i.At).ToList();
    }

    // ------------------------------------------------------------------ Écriture

    public async Task<MissionDetailDto> CreateAsync(MissionUpsertRequest r, CancellationToken ct)
    {
        await _upsertValidator.EnsureValidAsync(r, ct);
        var userId = _current.RequireUserId();
        var client = await RequireActiveClientAsync(r.ClientId, ct);
        var reference = await ResolveReferenceAsync(r.ReferenceNumber, client, null, ct);
        var created = await StatusAsync(MissionStatusCodes.Created, ct);

        await using var tx = await _db.BeginTransactionAsync(ct);

        var mission = new Mission
        {
            Reference = reference,
            ClientId = client.Id,
            PlannedDate = DateTime.SpecifyKind(r.PlannedDate, DateTimeKind.Utc),
            PickupLocation = ToLocation(r.Pickup),
            DeliveryLocation = ToLocation(r.Delivery),
            Description = TextUtils.Clean(r.Description),
            Goods = TextUtils.Clean(r.Goods),
            WeightKg = r.WeightKg,
            VolumeM3 = r.VolumeM3,
            CurrentStatusId = created.Id,
            CurrentStatus = created,
            CreatedBy = userId,
            CreatedAt = DateTime.UtcNow,
        };
        Touch(mission, "Mission créée");
        reference.Status = ReferenceStatuses.Used;
        mission.StatusHistory.Add(new MissionStatusHistory { ToStatusId = created.Id, ChangedBy = userId, ChangedAt = DateTime.UtcNow, Comment = "Création de la mission" });
        _db.Missions.Add(mission);
        await _db.SaveChangesAsync(ct);

        _audit.Add("Mission", mission.Id, AuditActions.Create, $"Mission {reference.Number} créée pour {client.Name}.",
            newValue: new { reference = reference.Number, client = client.Name, r.PlannedDate, from = r.Pickup.City, to = r.Delivery.City });
        await _db.SaveChangesAsync(ct);

        if (r.DriverId is { } driverId)
            await AssignInternalAsync(mission, new AssignMissionRequest(driverId, r.VehicleId, r.AssignComment), ct);

        await tx.CommitAsync(ct);
        return await GetAsync(mission.Id, ct);
    }

    public async Task<MissionDetailDto> UpdateAsync(int id, MissionUpsertRequest r, CancellationToken ct)
    {
        await _upsertValidator.EnsureValidAsync(r, ct);
        var userId = _current.RequireUserId();
        var mission = await LoadAsync(id, ct, tracking: true);
        EnsureNotLocked(mission);

        var before = Snapshot(mission);
        var client = mission.ClientId == r.ClientId ? mission.Client : await RequireActiveClientAsync(r.ClientId, ct);

        if (!string.Equals(mission.Reference.Number, r.ReferenceNumber.Trim(), StringComparison.OrdinalIgnoreCase) || mission.ClientId != client.Id)
        {
            if (mission.CurrentStatus.Code != MissionStatusCodes.Created)
                throw new BusinessRuleException("REFERENCE_LOCKED", "La référence et le client ne peuvent plus être modifiés après l'affectation.");
            var newRef = await ResolveReferenceAsync(r.ReferenceNumber, client, mission.Id, ct);
            if (newRef.Id != mission.ReferenceId)
            {
                mission.Reference.Status = ReferenceStatuses.Open;
                newRef.Status = ReferenceStatuses.Used;
                mission.Reference = newRef;
            }
            mission.ClientId = client.Id;
            mission.Client = client;
        }

        mission.PlannedDate = DateTime.SpecifyKind(r.PlannedDate, DateTimeKind.Utc);
        ApplyLocation(mission.PickupLocation, r.Pickup);
        ApplyLocation(mission.DeliveryLocation, r.Delivery);
        mission.Description = TextUtils.Clean(r.Description);
        mission.Goods = TextUtils.Clean(r.Goods);
        mission.WeightKg = r.WeightKg;
        mission.VolumeM3 = r.VolumeM3;
        mission.UpdatedAt = DateTime.UtcNow;
        mission.UpdatedBy = userId;
        Touch(mission, "Mission modifiée");

        _audit.Add("Mission", mission.Id, AuditActions.Update, $"Mission {mission.Reference.Number} modifiée.", before, Snapshot(mission));
        await SaveWithConcurrencyAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task DeleteAsync(int id, CancellationToken ct)
    {
        var mission = await LoadAsync(id, ct, tracking: true);
        if (mission.CurrentStatus.Code is not (MissionStatusCodes.Created or MissionStatusCodes.Cancelled))
            throw new BusinessRuleException("MISSION_NOT_DELETABLE", "Seules les missions créées ou annulées peuvent être supprimées. Annulez d'abord la mission.");

        mission.IsDeleted = true;
        mission.UpdatedAt = DateTime.UtcNow;
        mission.UpdatedBy = _current.UserId;
        mission.Reference.Status = ReferenceStatuses.Open; // la référence redevient disponible
        _audit.Add("Mission", mission.Id, AuditActions.Delete, $"Mission {mission.Reference.Number} supprimée (suppression logique).", Snapshot(mission));
        await _db.SaveChangesAsync(ct);
    }

    public async Task<MissionDetailDto> AssignAsync(int id, AssignMissionRequest r, CancellationToken ct)
    {
        await _assignValidator.EnsureValidAsync(r, ct);
        var mission = await LoadAsync(id, ct, tracking: true);
        await using var tx = await _db.BeginTransactionAsync(ct);
        await AssignInternalAsync(mission, r, ct);
        await tx.CommitAsync(ct);
        return await GetAsync(id, ct);
    }

    private async Task AssignInternalAsync(Mission mission, AssignMissionRequest r, CancellationToken ct)
    {
        EnsureNotLocked(mission);
        var userId = _current.RequireUserId();

        var driver = await _db.Drivers.Include(d => d.User)
            .FirstOrDefaultAsync(d => d.Id == r.DriverId && !d.IsDeleted, ct)
            ?? throw new NotFoundException("DRIVER_NOT_FOUND", "Le chauffeur n'existe pas.");
        if (!driver.IsActive)
            throw new BusinessRuleException("DRIVER_INACTIVE", $"{driver.FullName} est désactivé et ne peut pas recevoir de mission.");
        if (driver.User is null || !driver.User.IsActive || driver.User.IsDeleted)
            throw new BusinessRuleException("DRIVER_NO_ACTIVE_USER", $"{driver.FullName} n'a pas de compte utilisateur actif. Activez son accès avant de l'affecter.");
        if (driver.LicenseExpiryDate.Date < DateTime.UtcNow.Date)
            throw new BusinessRuleException("DRIVER_LICENSE_EXPIRED", $"Le permis de {driver.FullName} a expiré le {driver.LicenseExpiryDate:dd/MM/yyyy}.");

        Vehicle? vehicle = null;
        var vehicleId = r.VehicleId ?? driver.DefaultVehicleId;
        if (vehicleId is { } vid)
        {
            vehicle = await _db.Vehicles.FirstOrDefaultAsync(v => v.Id == vid && !v.IsDeleted, ct)
                ?? throw new NotFoundException("VEHICLE_NOT_FOUND", "Le véhicule n'existe pas.");
            if (!vehicle.IsActive || vehicle.Status is VehicleStatuses.Maintenance or VehicleStatuses.OutOfService)
                throw new BusinessRuleException("VEHICLE_UNAVAILABLE", $"Le véhicule {vehicle.PlateNumber} n'est pas disponible.");
        }

        // L'historique des affectations n'est jamais supprimé : l'affectation active est clôturée.
        var previous = await _db.MissionAssignments.Include(a => a.Driver)
            .Where(a => a.MissionId == mission.Id && a.Status == AssignmentStatuses.Active).ToListAsync(ct);
        foreach (var prev in previous)
        {
            prev.Status = AssignmentStatuses.Replaced;
            prev.EndedAt = DateTime.UtcNow;
            _audit.Add("Mission", mission.Id, AuditActions.Unassign, $"{prev.Driver.FullName} retiré de la mission {mission.Reference.Number}.");
        }

        _db.MissionAssignments.Add(new MissionAssignment
        {
            MissionId = mission.Id, DriverId = driver.Id, VehicleId = vehicle?.Id, AssignedBy = userId,
            AssignedAt = DateTime.UtcNow, Status = AssignmentStatuses.Active, Comment = TextUtils.Clean(r.Comment),
        });

        mission.CurrentDriverId = driver.Id;
        mission.CurrentVehicleId = vehicle?.Id;
        mission.UpdatedAt = DateTime.UtcNow;
        mission.UpdatedBy = userId;

        if (mission.CurrentStatus.Code == MissionStatusCodes.Created)
        {
            var assigned = await StatusAsync(MissionStatusCodes.Assigned, ct);
            AddStatusHistory(mission, assigned, userId, TextUtils.Clean(r.Comment) ?? $"Affectée à {driver.FullName}");
        }
        Touch(mission, $"Affectée à {driver.FullName}");

        _audit.Add("Mission", mission.Id, AuditActions.Assign,
            $"Mission {mission.Reference.Number} affectée à {driver.FullName}{(vehicle is null ? "" : $" ({vehicle.PlateNumber})")}.",
            previous.Count == 0 ? null : new { drivers = previous.Select(p => p.Driver.FullName) },
            new { driver = driver.FullName, vehicle = vehicle?.PlateNumber, r.Comment });

        await _notifications.NotifyAdminsAsync("Mission affectée",
            $"Mission {mission.Reference.Number} affectée à {driver.FirstName}.", NotificationTypes.Info, "Mission", mission.Id, ct);
        _notifications.NotifyUser(driver.User.Id, "Nouvelle mission",
            $"La mission {mission.Reference.Number} vous a été affectée.", NotificationTypes.Info, "Mission", mission.Id);

        await SaveWithConcurrencyAsync(ct);
    }

    public async Task<MissionDetailDto> ChangeStatusAsync(int id, ChangeStatusRequest r, CancellationToken ct, int? restrictToDriverId = null)
    {
        await _statusValidator.EnsureValidAsync(r, ct);
        var userId = _current.RequireUserId();
        var mission = await LoadAsync(id, ct, tracking: true);
        EnsureDriverScope(mission, restrictToDriverId);

        var from = mission.CurrentStatus;
        if (from.Code == r.StatusCode)
            throw new BusinessRuleException("STATUS_UNCHANGED", $"La mission est déjà au statut « {from.Label} ».");
        if (r.StatusCode == MissionStatusCodes.Assigned)
            throw new BusinessRuleException("USE_ASSIGN_ENDPOINT", "Utilisez l'affectation pour passer une mission au statut « Affectée ».");
        if (!MissionStatusCodes.CanTransition(from.Code, r.StatusCode))
        {
            var target = await StatusAsync(r.StatusCode, ct);
            throw new BusinessRuleException("INVALID_STATUS_TRANSITION", $"Passage de « {from.Label} » à « {target.Label} » impossible.");
        }
        var needsDriver = r.StatusCode is MissionStatusCodes.ToBePickedUp or MissionStatusCodes.PickedUp or MissionStatusCodes.InProgress or MissionStatusCodes.Completed;
        if (needsDriver && mission.CurrentDriverId is null)
            throw new BusinessRuleException("MISSION_NOT_ASSIGNED", "Affectez un chauffeur avant de faire avancer la mission.");

        var to = await StatusAsync(r.StatusCode, ct);
        AddStatusHistory(mission, to, userId, TextUtils.Clean(r.Comment), r.Latitude, r.Longitude);
        mission.UpdatedAt = DateTime.UtcNow;
        mission.UpdatedBy = userId;
        Touch(mission, $"Passée à {to.Label}");

        if (mission.CurrentVehicle is { } vehicle)
        {
            if (to.Code is MissionStatusCodes.PickedUp or MissionStatusCodes.InProgress) vehicle.Status = VehicleStatuses.InUse;
            if (to.Code is MissionStatusCodes.Completed or MissionStatusCodes.Cancelled && vehicle.Status == VehicleStatuses.InUse) vehicle.Status = VehicleStatuses.Available;
        }
        if (to.IsFinal)
        {
            var active = await _db.MissionAssignments.Where(a => a.MissionId == mission.Id && a.Status == AssignmentStatuses.Active).ToListAsync(ct);
            foreach (var a in active) { a.Status = AssignmentStatuses.Ended; a.EndedAt = DateTime.UtcNow; }
        }

        _audit.Add("Mission", mission.Id, AuditActions.StatusChange,
            $"Mission {mission.Reference.Number} passée à {to.Label}.",
            new { status = from.Code }, new { status = to.Code, r.Comment, r.Latitude, r.Longitude });

        var (title, type) = to.Code switch
        {
            MissionStatusCodes.Anomaly => ("Nouvelle anomalie détectée", NotificationTypes.Danger),
            MissionStatusCodes.Completed => ("Mission terminée", NotificationTypes.Success),
            MissionStatusCodes.Cancelled => ("Mission annulée", NotificationTypes.Warning),
            _ => ("Statut mis à jour", NotificationTypes.Info),
        };
        var msg = to.Code == MissionStatusCodes.Anomaly
            ? $"Anomalie sur la mission {mission.Reference.Number} : {Short(r.Comment)}"
            : $"Mission {mission.Reference.Number} {to.Label.ToLowerInvariant()}.";
        await _notifications.NotifyAdminsAsync(title, msg, type, "Mission", mission.Id, ct);

        await SaveWithConcurrencyAsync(ct);
        return await GetAsync(id, ct, restrictToDriverId);
    }

    // ------------------------------------------------------------------ Helpers

    private async Task<Mission> LoadAsync(int id, CancellationToken ct, bool tracking)
    {
        IQueryable<Mission> q = _db.Missions
            .Include(m => m.Reference).Include(m => m.Client)
            .Include(m => m.PickupLocation).Include(m => m.DeliveryLocation)
            .Include(m => m.CurrentStatus).Include(m => m.CurrentDriver).Include(m => m.CurrentVehicle);
        if (!tracking) q = q.AsNoTracking();
        return await q.FirstOrDefaultAsync(m => m.Id == id && !m.IsDeleted, ct)
            ?? throw new NotFoundException("MISSION_NOT_FOUND", "La mission n'existe pas.");
    }

    private async Task<MissionDetailDto> ToDetailAsync(Mission m, CancellationToken ct)
    {
        var statuses = await _db.MissionStatuses.AsNoTracking().ToDictionaryAsync(s => s.Code, s => s.Label, ct);
        var allowed = MissionStatusCodes.Transitions.TryGetValue(m.CurrentStatus.Code, out var codes)
            ? codes.Select(c => new StatusDto(c, statuses.GetValueOrDefault(c, c))).ToList()
            : new List<StatusDto>();

        var assignments = await _db.MissionAssignments.AsNoTracking().Where(a => a.MissionId == m.Id)
            .OrderByDescending(a => a.AssignedAt)
            .Select(a => new AssignmentDto(a.Id, a.DriverId, a.Driver.FirstName + " " + a.Driver.LastName, a.VehicleId,
                a.Vehicle != null ? a.Vehicle.PlateNumber : null, a.AssignedByUser.FirstName + " " + a.AssignedByUser.LastName,
                a.AssignedAt, a.Status, a.EndedAt, a.Comment))
            .ToListAsync(ct);

        var createdBy = m.CreatedBy is null ? null : await _db.Users.Where(u => u.Id == m.CreatedBy)
            .Select(u => u.FirstName + " " + u.LastName).FirstOrDefaultAsync(ct);
        var docCount = await _db.Documents.CountAsync(d => d.MissionId == m.Id && !d.IsDeleted, ct);

        return new MissionDetailDto(
            m.Id, m.ReferenceId, m.Reference.Number, new ClientSummaryDto(m.Client.Id, m.Client.Code, m.Client.Name), m.PlannedDate,
            ToDto(m.PickupLocation), ToDto(m.DeliveryLocation), m.Description, m.Goods, m.WeightKg, m.VolumeM3,
            new StatusDto(m.CurrentStatus.Code, m.CurrentStatus.Label),
            m.CurrentDriver is null ? null : new DriverSummaryDto(m.CurrentDriver.Id, m.CurrentDriver.FullName, m.CurrentDriver.Phone, m.CurrentDriver.Email),
            m.CurrentVehicle is null ? null : new VehicleSummaryDto(m.CurrentVehicle.Id, m.CurrentVehicle.PlateNumber, m.CurrentVehicle.Brand, m.CurrentVehicle.Model, m.CurrentVehicle.Type),
            m.CreatedAt, createdBy, m.UpdatedAt, m.LastAction, m.LastActionAt,
            m.CurrentStatus.IsFinal, allowed, assignments, docCount);
    }

    private async Task<Client> RequireActiveClientAsync(int clientId, CancellationToken ct)
    {
        var client = await _db.Clients.FirstOrDefaultAsync(c => c.Id == clientId && !c.IsDeleted, ct)
            ?? throw new NotFoundException("CLIENT_NOT_FOUND", "Le client sélectionné n'existe pas.");
        if (!client.IsActive) throw new BusinessRuleException("CLIENT_INACTIVE", $"Le client {client.Name} est désactivé.");
        return client;
    }

    /// <summary>Une mission est toujours liée à une référence : on réutilise une référence ouverte du même client
    /// ou on en crée une nouvelle. Une référence déjà utilisée par une autre mission est refusée.</summary>
    private async Task<Reference> ResolveReferenceAsync(string number, Client client, int? currentMissionId, CancellationToken ct)
    {
        var n = number.Trim().ToUpperInvariant();
        var existing = await _db.References.Include(r => r.Missions)
            .FirstOrDefaultAsync(r => r.Number == n, ct);
        if (existing is null)
        {
            var created = new Reference { Number = n, ClientId = client.Id, Source = ReferenceSources.Manual, Status = ReferenceStatuses.Open, CreatedBy = _current.UserId };
            _db.References.Add(created);
            _audit.Add("Reference", n, AuditActions.Create, $"Référence {n} créée depuis le formulaire mission.");
            return created;
        }
        if (existing.IsDeleted)
            throw new ConflictException("REFERENCE_DELETED", $"La référence {n} a été supprimée et ne peut pas être réutilisée.");
        if (existing.Missions.Any(m => !m.IsDeleted && m.Id != currentMissionId))
            throw new ConflictException("REFERENCE_ALREADY_USED", $"La référence {n} est déjà associée à une mission.");
        if (existing.ClientId != client.Id)
            throw new BusinessRuleException("REFERENCE_CLIENT_MISMATCH", $"La référence {n} appartient à un autre client.");
        if (existing.Status == ReferenceStatuses.Cancelled)
            throw new BusinessRuleException("REFERENCE_CANCELLED", $"La référence {n} est annulée.");
        return existing;
    }

    private async Task<MissionStatus> StatusAsync(string code, CancellationToken ct) =>
        await _db.MissionStatuses.FirstOrDefaultAsync(s => s.Code == code, ct)
        ?? throw new AppException("STATUS_NOT_CONFIGURED", $"Statut {code} absent de la base.", 500);

    private void AddStatusHistory(Mission mission, MissionStatus to, int userId, string? comment, decimal? lat = null, decimal? lng = null)
    {
        _db.MissionStatusHistories.Add(new MissionStatusHistory
        {
            MissionId = mission.Id, FromStatusId = mission.CurrentStatusId, ToStatusId = to.Id,
            ChangedBy = userId, ChangedAt = DateTime.UtcNow, Comment = comment, Latitude = lat, Longitude = lng,
        });
        mission.CurrentStatusId = to.Id;
        mission.CurrentStatus = to;
    }

    private static void EnsureNotLocked(Mission mission)
    {
        if (mission.CurrentStatus.IsFinal || MissionStatusCodes.Final.Contains(mission.CurrentStatus.Code))
            throw new BusinessRuleException("MISSION_LOCKED", $"La mission est « {mission.CurrentStatus.Label} » et ne peut plus être modifiée.");
    }

    private static void EnsureDriverScope(Mission mission, int? restrictToDriverId)
    {
        if (restrictToDriverId is { } driverId && mission.CurrentDriverId != driverId)
            throw new NotFoundException("MISSION_NOT_FOUND", "La mission n'existe pas.");
    }

    private async Task SaveWithConcurrencyAsync(CancellationToken ct)
    {
        try { await _db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConflictException("CONCURRENCY_CONFLICT", "La mission a été modifiée par un autre utilisateur. Rechargez la page.");
        }
    }

    private static void Touch(Mission m, string action) { m.LastAction = action; m.LastActionAt = DateTime.UtcNow; }

    private static Location ToLocation(LocationInput i) => new()
    {
        Label = TextUtils.Clean(i.Label), Address = i.Address.Trim(), City = i.City.Trim(),
        PostalCode = TextUtils.Clean(i.PostalCode), Country = TextUtils.Clean(i.Country) ?? "France",
    };

    private static void ApplyLocation(Location l, LocationInput i)
    {
        l.Label = TextUtils.Clean(i.Label); l.Address = i.Address.Trim(); l.City = i.City.Trim();
        l.PostalCode = TextUtils.Clean(i.PostalCode); l.Country = TextUtils.Clean(i.Country) ?? "France";
    }

    private static LocationDto ToDto(Location l) => new(l.Label, l.Address, l.City, l.PostalCode, l.Country);

    private static object Snapshot(Mission m) => new
    {
        reference = m.Reference?.Number, m.ClientId, m.PlannedDate,
        pickup = m.PickupLocation?.City, delivery = m.DeliveryLocation?.City,
        m.Description, m.Goods, m.WeightKg, m.VolumeM3,
    };

    private static string Short(string? s) => s is null ? "" : s.Length <= 80 ? s : s[..80] + "…";
}
