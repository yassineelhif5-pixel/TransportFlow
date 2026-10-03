using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Transport.Application.Auth;
using Transport.Application.Common;
using Transport.Application.Interfaces;
using Transport.Application.Missions;
using Transport.Domain.Entities;
using Transport.Domain.Enums;

namespace Transport.Application.Drivers;

public record DriverDto(int Id, string FirstName, string LastName, string FullName, string? Email, string Phone,
    string LicenseNumber, DateTime LicenseExpiryDate, bool LicenseExpired, bool LicenseExpiresSoon,
    int? DefaultVehicleId, string? VehiclePlate, bool IsActive, bool HasUserAccount, bool UserActive, string? Username, int ActiveMissions);

public record DriverDetailDto(DriverDto Driver, IReadOnlyList<MissionListItemDto> CurrentMissions,
    IReadOnlyList<AssignmentHistoryDto> History, int CompletedMissions, int TotalAssignments);

public record AssignmentHistoryDto(int MissionId, string ReferenceNumber, string ClientName, DateTime AssignedAt, string Status, DateTime? EndedAt, string MissionStatusLabel);

public record DriverUpsertRequest(string FirstName, string LastName, string? Email, string Phone, string LicenseNumber,
    DateTime LicenseExpiryDate, int? DefaultVehicleId, bool CreateAccount = false, string? Username = null, string? Password = null);

public record SetActiveRequest(bool IsActive);

public class DriverQuery : PagedQuery
{
    public bool? IsActive { get; set; }
}

public class DriverUpsertRequestValidator : AbstractValidator<DriverUpsertRequest>
{
    public DriverUpsertRequestValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().WithMessage("Le prénom est obligatoire.").MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().WithMessage("Le nom est obligatoire.").MaximumLength(100);
        RuleFor(x => x.Email).EmailAddress().WithMessage("Adresse e-mail invalide.").MaximumLength(256).When(x => !string.IsNullOrWhiteSpace(x.Email));
        RuleFor(x => x.Phone).NotEmpty().WithMessage("Le téléphone est obligatoire.")
            .Matches(@"^\+?[0-9 .\-()]{6,20}$").WithMessage("Numéro de téléphone invalide.");
        RuleFor(x => x.LicenseNumber).NotEmpty().WithMessage("Le numéro de permis est obligatoire.").MaximumLength(50);
        RuleFor(x => x.LicenseExpiryDate).NotEmpty().WithMessage("La date d'expiration du permis est obligatoire.");
        When(x => x.CreateAccount, () =>
        {
            RuleFor(x => x.Email).NotEmpty().WithMessage("L'e-mail est obligatoire pour créer un accès.");
            RuleFor(x => x.Password!).StrongPassword();
            RuleFor(x => x.Username).MaximumLength(100).Matches("^[a-zA-Z0-9._@-]+$").When(x => !string.IsNullOrWhiteSpace(x.Username))
                .WithMessage("Identifiant invalide (lettres, chiffres, . _ @ -).");
        });
    }
}

public interface IDriverService
{
    Task<PagedResult<DriverDto>> ListAsync(DriverQuery q, CancellationToken ct);
    IQueryable<DriverDto> Query(DriverQuery q);
    Task<DriverDetailDto> GetAsync(int id, CancellationToken ct);
    Task<DriverDetailDto> CreateAsync(DriverUpsertRequest r, CancellationToken ct);
    Task<DriverDetailDto> UpdateAsync(int id, DriverUpsertRequest r, CancellationToken ct);
    Task<DriverDetailDto> SetActiveAsync(int id, bool isActive, CancellationToken ct);
    Task<int?> GetDriverIdForUserAsync(int userId, CancellationToken ct);
}

public class DriverService : IDriverService
{
    private readonly IApplicationDbContext _db;
    private readonly ICurrentUserService _current;
    private readonly IAuditService _audit;
    private readonly IPasswordHasherService _hasher;
    private readonly IMissionService _missions;
    private readonly IValidator<DriverUpsertRequest> _validator;

    public DriverService(IApplicationDbContext db, ICurrentUserService current, IAuditService audit,
        IPasswordHasherService hasher, IMissionService missions, IValidator<DriverUpsertRequest> validator)
    {
        _db = db; _current = current; _audit = audit; _hasher = hasher; _missions = missions; _validator = validator;
    }

    public IQueryable<DriverDto> Query(DriverQuery q)
    {
        var today = DateTime.UtcNow.Date;
        var soon = today.AddDays(30);
        var query = _db.Drivers.AsNoTracking().Where(d => !d.IsDeleted);
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(d => d.LastName.Contains(s) || d.FirstName.Contains(s) || d.Phone.Contains(s)
                || (d.Email != null && d.Email.Contains(s)) || d.LicenseNumber.Contains(s));
        }
        if (q.IsActive is { } active) query = query.Where(d => d.IsActive == active);

        query = q.SortBy?.ToLowerInvariant() switch
        {
            "firstname" => query.OrderByDir(d => d.FirstName, q.Descending),
            "license" => query.OrderByDir(d => d.LicenseExpiryDate, q.Descending),
            "status" => query.OrderByDir(d => d.IsActive, q.Descending),
            _ => query.OrderByDir(d => d.LastName, q.Descending),
        };

        return query.Select(d => new DriverDto(d.Id, d.FirstName, d.LastName, d.FirstName + " " + d.LastName, d.Email, d.Phone,
            d.LicenseNumber, d.LicenseExpiryDate, d.LicenseExpiryDate < today, d.LicenseExpiryDate >= today && d.LicenseExpiryDate < soon,
            d.DefaultVehicleId, d.DefaultVehicle != null ? d.DefaultVehicle.PlateNumber : null, d.IsActive,
            d.UserId != null, d.User != null && d.User.IsActive, d.User != null ? d.User.Username : null,
            _db.Missions.Count(m => !m.IsDeleted && m.CurrentDriverId == d.Id && MissionStatusCodes.Active.Contains(m.CurrentStatus.Code))));
    }

    public Task<PagedResult<DriverDto>> ListAsync(DriverQuery q, CancellationToken ct) => Query(q).ToPagedAsync(q, ct);

    public async Task<DriverDetailDto> GetAsync(int id, CancellationToken ct)
    {
        var driver = await Query(new DriverQuery()).FirstOrDefaultAsync(d => d.Id == id, ct)
            ?? throw new NotFoundException("DRIVER_NOT_FOUND", "Le chauffeur n'existe pas.");

        var current = await _missions.ListAsync(new MissionQuery { DriverId = id, Status = string.Join(',', MissionStatusCodes.Active.Append(MissionStatusCodes.Anomaly)), PageSize = 50, SortDir = "asc" }, ct);
        var history = await _db.MissionAssignments.AsNoTracking().Where(a => a.DriverId == id)
            .OrderByDescending(a => a.AssignedAt).Take(50)
            .Select(a => new AssignmentHistoryDto(a.MissionId, a.Mission.Reference.Number, a.Mission.Client.Name, a.AssignedAt, a.Status, a.EndedAt, a.Mission.CurrentStatus.Label))
            .ToListAsync(ct);
        var completed = await _db.Missions.CountAsync(m => !m.IsDeleted && m.CurrentDriverId == id && m.CurrentStatus.Code == MissionStatusCodes.Completed, ct);
        var total = await _db.MissionAssignments.CountAsync(a => a.DriverId == id, ct);
        return new DriverDetailDto(driver, current.Items, history, completed, total);
    }

    public async Task<DriverDetailDto> CreateAsync(DriverUpsertRequest r, CancellationToken ct)
    {
        await _validator.EnsureValidAsync(r, ct);
        await EnsureUniqueLicenseAsync(r.LicenseNumber, null, ct);
        await EnsureVehicleAsync(r.DefaultVehicleId, ct);

        var driver = new Driver
        {
            FirstName = r.FirstName.Trim(), LastName = r.LastName.Trim().ToUpperInvariant(), Email = TextUtils.Clean(r.Email),
            Phone = r.Phone.Trim(), LicenseNumber = r.LicenseNumber.Trim().ToUpperInvariant(),
            LicenseExpiryDate = DateTime.SpecifyKind(r.LicenseExpiryDate.Date, DateTimeKind.Utc),
            DefaultVehicleId = r.DefaultVehicleId, IsActive = true, CreatedBy = _current.UserId, CreatedAt = DateTime.UtcNow,
        };
        if (r.CreateAccount) driver.User = await BuildUserAsync(r, ct);
        _db.Drivers.Add(driver);
        await _db.SaveChangesAsync(ct);
        _audit.Add("Driver", driver.Id, AuditActions.Create, $"Chauffeur {driver.FullName} créé{(r.CreateAccount ? " avec accès mobile" : "")}.",
            newValue: new { driver.FirstName, driver.LastName, driver.Phone, driver.LicenseNumber });
        await _db.SaveChangesAsync(ct);
        return await GetAsync(driver.Id, ct);
    }

    public async Task<DriverDetailDto> UpdateAsync(int id, DriverUpsertRequest r, CancellationToken ct)
    {
        await _validator.EnsureValidAsync(r, ct);
        var driver = await _db.Drivers.Include(d => d.User).FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted, ct)
            ?? throw new NotFoundException("DRIVER_NOT_FOUND", "Le chauffeur n'existe pas.");
        await EnsureUniqueLicenseAsync(r.LicenseNumber, id, ct);
        await EnsureVehicleAsync(r.DefaultVehicleId, ct);

        var before = new { driver.FirstName, driver.LastName, driver.Email, driver.Phone, driver.LicenseNumber, driver.LicenseExpiryDate, driver.DefaultVehicleId };
        driver.FirstName = r.FirstName.Trim();
        driver.LastName = r.LastName.Trim().ToUpperInvariant();
        driver.Email = TextUtils.Clean(r.Email);
        driver.Phone = r.Phone.Trim();
        driver.LicenseNumber = r.LicenseNumber.Trim().ToUpperInvariant();
        driver.LicenseExpiryDate = DateTime.SpecifyKind(r.LicenseExpiryDate.Date, DateTimeKind.Utc);
        driver.DefaultVehicleId = r.DefaultVehicleId;
        driver.UpdatedAt = DateTime.UtcNow;
        driver.UpdatedBy = _current.UserId;
        if (r.CreateAccount && driver.User is null) driver.User = await BuildUserAsync(r, ct);
        else if (driver.User is not null)
        {
            driver.User.FirstName = driver.FirstName;
            driver.User.LastName = driver.LastName;
            driver.User.Phone = driver.Phone;
        }

        _audit.Add("Driver", driver.Id, AuditActions.Update, $"Chauffeur {driver.FullName} modifié.", before,
            new { driver.FirstName, driver.LastName, driver.Email, driver.Phone, driver.LicenseNumber, driver.LicenseExpiryDate, driver.DefaultVehicleId });
        await _db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task<DriverDetailDto> SetActiveAsync(int id, bool isActive, CancellationToken ct)
    {
        var driver = await _db.Drivers.Include(d => d.User).FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted, ct)
            ?? throw new NotFoundException("DRIVER_NOT_FOUND", "Le chauffeur n'existe pas.");
        if (!isActive)
        {
            var active = await _db.Missions.CountAsync(m => !m.IsDeleted && m.CurrentDriverId == id && MissionStatusCodes.Active.Contains(m.CurrentStatus.Code), ct);
            if (active > 0)
                throw new BusinessRuleException("DRIVER_HAS_ACTIVE_MISSIONS", $"{driver.FullName} a {active} mission(s) en cours. Réaffectez-les avant de le désactiver.");
        }
        driver.IsActive = isActive;
        if (driver.User is not null) driver.User.IsActive = isActive;
        driver.UpdatedAt = DateTime.UtcNow;
        driver.UpdatedBy = _current.UserId;
        _audit.Add("Driver", driver.Id, AuditActions.Update, $"Chauffeur {driver.FullName} {(isActive ? "activé" : "désactivé")}.",
            new { IsActive = !isActive }, new { IsActive = isActive });
        await _db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public Task<int?> GetDriverIdForUserAsync(int userId, CancellationToken ct) =>
        _db.Drivers.Where(d => d.UserId == userId && !d.IsDeleted && d.IsActive).Select(d => (int?)d.Id).FirstOrDefaultAsync(ct);

    private async Task<User> BuildUserAsync(DriverUpsertRequest r, CancellationToken ct)
    {
        var username = (TextUtils.Clean(r.Username) ?? r.Email!.Trim()).ToLowerInvariant();
        var email = r.Email!.Trim().ToLowerInvariant();
        if (await _db.Users.AnyAsync(u => u.Username == username || u.Email == email, ct))
            throw new ConflictException("USER_ALREADY_EXISTS", "Un utilisateur avec cet identifiant ou cet e-mail existe déjà.");
        var role = await _db.Roles.FirstAsync(x => x.Code == RoleCodes.Driver, ct);
        return new User
        {
            Username = username, Email = email, PasswordHash = _hasher.Hash(r.Password!), FirstName = r.FirstName.Trim(),
            LastName = r.LastName.Trim().ToUpperInvariant(), Phone = r.Phone.Trim(), RoleId = role.Id, IsActive = true,
            MustChangePassword = true, CreatedAt = DateTime.UtcNow, CreatedBy = _current.UserId,
        };
    }

    private async Task EnsureUniqueLicenseAsync(string license, int? id, CancellationToken ct)
    {
        var n = license.Trim().ToUpperInvariant();
        if (await _db.Drivers.AnyAsync(d => d.LicenseNumber == n && d.Id != id && !d.IsDeleted, ct))
            throw new ConflictException("LICENSE_ALREADY_EXISTS", "Ce numéro de permis est déjà enregistré.");
    }

    private async Task EnsureVehicleAsync(int? vehicleId, CancellationToken ct)
    {
        if (vehicleId is null) return;
        if (!await _db.Vehicles.AnyAsync(v => v.Id == vehicleId && !v.IsDeleted && v.IsActive, ct))
            throw new NotFoundException("VEHICLE_NOT_FOUND", "Le véhicule sélectionné n'existe pas ou est inactif.");
    }
}
