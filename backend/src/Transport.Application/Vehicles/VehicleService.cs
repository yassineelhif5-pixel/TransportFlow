using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Transport.Application.Common;
using Transport.Application.Drivers;
using Transport.Application.Interfaces;
using Transport.Domain.Entities;
using Transport.Domain.Enums;

namespace Transport.Application.Vehicles;

public record VehicleDto(int Id, string PlateNumber, string Brand, string Model, string Type, decimal CapacityKg, decimal? CapacityM3,
    string Status, bool IsActive, string? DriverName, int? DriverId, string? CurrentMissionReference, int? CurrentMissionId);

public record VehicleDetailDto(VehicleDto Vehicle, IReadOnlyList<AssignmentHistoryDto> History, int TotalMissions);

public record VehicleUpsertRequest(string PlateNumber, string Brand, string Model, string Type, decimal CapacityKg, decimal? CapacityM3, string? Status);
public record VehicleStatusRequest(string Status);

public class VehicleQuery : PagedQuery
{
    public string? Status { get; set; }
    public bool? IsActive { get; set; }
}

public class VehicleUpsertRequestValidator : AbstractValidator<VehicleUpsertRequest>
{
    public VehicleUpsertRequestValidator()
    {
        RuleFor(x => x.PlateNumber).NotEmpty().WithMessage("L'immatriculation est obligatoire.")
            .Matches("^[A-Za-z0-9 -]{4,15}$").WithMessage("Immatriculation invalide.");
        RuleFor(x => x.Brand).NotEmpty().WithMessage("La marque est obligatoire.").MaximumLength(80);
        RuleFor(x => x.Model).NotEmpty().WithMessage("Le modèle est obligatoire.").MaximumLength(80);
        RuleFor(x => x.Type).NotEmpty().WithMessage("Le type est obligatoire.").MaximumLength(60);
        RuleFor(x => x.CapacityKg).GreaterThan(0).WithMessage("La capacité doit être positive.").LessThanOrEqualTo(100000);
        RuleFor(x => x.CapacityM3).GreaterThanOrEqualTo(0).LessThanOrEqualTo(1000).When(x => x.CapacityM3.HasValue);
        RuleFor(x => x.Status).Must(s => s is null || VehicleStatuses.All.Contains(s)).WithMessage("Statut de véhicule invalide.");
    }
}

public interface IVehicleService
{
    Task<PagedResult<VehicleDto>> ListAsync(VehicleQuery q, CancellationToken ct);
    Task<VehicleDetailDto> GetAsync(int id, CancellationToken ct);
    Task<VehicleDetailDto> CreateAsync(VehicleUpsertRequest r, CancellationToken ct);
    Task<VehicleDetailDto> UpdateAsync(int id, VehicleUpsertRequest r, CancellationToken ct);
    Task<VehicleDetailDto> SetStatusAsync(int id, string status, CancellationToken ct);
}

public class VehicleService : IVehicleService
{
    private readonly IApplicationDbContext _db;
    private readonly ICurrentUserService _current;
    private readonly IAuditService _audit;
    private readonly IValidator<VehicleUpsertRequest> _validator;

    public VehicleService(IApplicationDbContext db, ICurrentUserService current, IAuditService audit, IValidator<VehicleUpsertRequest> validator)
    {
        _db = db; _current = current; _audit = audit; _validator = validator;
    }

    private IQueryable<VehicleDto> Query(VehicleQuery q)
    {
        var query = _db.Vehicles.AsNoTracking().Where(v => !v.IsDeleted);
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(v => v.PlateNumber.Contains(s) || v.Brand.Contains(s) || v.Model.Contains(s) || v.Type.Contains(s));
        }
        if (!string.IsNullOrWhiteSpace(q.Status)) query = query.Where(v => v.Status == q.Status);
        if (q.IsActive is { } a) query = query.Where(v => v.IsActive == a);
        query = q.SortBy?.ToLowerInvariant() switch
        {
            "brand" => query.OrderByDir(v => v.Brand, q.Descending),
            "type" => query.OrderByDir(v => v.Type, q.Descending),
            "capacity" => query.OrderByDir(v => v.CapacityKg, q.Descending),
            "status" => query.OrderByDir(v => v.Status, q.Descending),
            _ => query.OrderByDir(v => v.PlateNumber, q.Descending),
        };

        return query.Select(v => new VehicleDto(v.Id, v.PlateNumber, v.Brand, v.Model, v.Type, v.CapacityKg, v.CapacityM3, v.Status, v.IsActive,
            _db.Drivers.Where(d => d.DefaultVehicleId == v.Id && !d.IsDeleted).Select(d => d.FirstName + " " + d.LastName).FirstOrDefault(),
            _db.Drivers.Where(d => d.DefaultVehicleId == v.Id && !d.IsDeleted).Select(d => (int?)d.Id).FirstOrDefault(),
            _db.Missions.Where(m => !m.IsDeleted && m.CurrentVehicleId == v.Id && MissionStatusCodes.Active.Contains(m.CurrentStatus.Code))
                .OrderBy(m => m.PlannedDate).Select(m => m.Reference.Number).FirstOrDefault(),
            _db.Missions.Where(m => !m.IsDeleted && m.CurrentVehicleId == v.Id && MissionStatusCodes.Active.Contains(m.CurrentStatus.Code))
                .OrderBy(m => m.PlannedDate).Select(m => (int?)m.Id).FirstOrDefault()));
    }

    public Task<PagedResult<VehicleDto>> ListAsync(VehicleQuery q, CancellationToken ct) => Query(q).ToPagedAsync(q, ct);

    public async Task<VehicleDetailDto> GetAsync(int id, CancellationToken ct)
    {
        var vehicle = await Query(new VehicleQuery()).FirstOrDefaultAsync(v => v.Id == id, ct)
            ?? throw new NotFoundException("VEHICLE_NOT_FOUND", "Le véhicule n'existe pas.");
        var history = await _db.MissionAssignments.AsNoTracking().Where(a => a.VehicleId == id)
            .OrderByDescending(a => a.AssignedAt).Take(50)
            .Select(a => new AssignmentHistoryDto(a.MissionId, a.Mission.Reference.Number, a.Mission.Client.Name, a.AssignedAt, a.Status, a.EndedAt, a.Mission.CurrentStatus.Label))
            .ToListAsync(ct);
        var total = await _db.MissionAssignments.Where(a => a.VehicleId == id).Select(a => a.MissionId).Distinct().CountAsync(ct);
        return new VehicleDetailDto(vehicle, history, total);
    }

    public async Task<VehicleDetailDto> CreateAsync(VehicleUpsertRequest r, CancellationToken ct)
    {
        await _validator.EnsureValidAsync(r, ct);
        var plate = NormalizePlate(r.PlateNumber);
        if (await _db.Vehicles.AnyAsync(v => v.PlateNumber == plate, ct))
            throw new ConflictException("VEHICLE_PLATE_EXISTS", $"Le véhicule {plate} existe déjà.");
        var v = new Vehicle { PlateNumber = plate, IsActive = true, CreatedAt = DateTime.UtcNow, CreatedBy = _current.UserId };
        Apply(v, r);
        _db.Vehicles.Add(v);
        await _db.SaveChangesAsync(ct);
        _audit.Add("Vehicle", v.Id, AuditActions.Create, $"Véhicule {plate} créé.");
        await _db.SaveChangesAsync(ct);
        return await GetAsync(v.Id, ct);
    }

    public async Task<VehicleDetailDto> UpdateAsync(int id, VehicleUpsertRequest r, CancellationToken ct)
    {
        await _validator.EnsureValidAsync(r, ct);
        var v = await _db.Vehicles.FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct)
            ?? throw new NotFoundException("VEHICLE_NOT_FOUND", "Le véhicule n'existe pas.");
        var plate = NormalizePlate(r.PlateNumber);
        if (plate != v.PlateNumber && await _db.Vehicles.AnyAsync(x => x.PlateNumber == plate && x.Id != id, ct))
            throw new ConflictException("VEHICLE_PLATE_EXISTS", $"Le véhicule {plate} existe déjà.");
        var before = new { v.PlateNumber, v.Brand, v.Model, v.Type, v.CapacityKg, v.Status };
        v.PlateNumber = plate;
        Apply(v, r);
        v.UpdatedAt = DateTime.UtcNow;
        v.UpdatedBy = _current.UserId;
        _audit.Add("Vehicle", v.Id, AuditActions.Update, $"Véhicule {plate} modifié.", before, new { v.PlateNumber, v.Brand, v.Model, v.Type, v.CapacityKg, v.Status });
        await _db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task<VehicleDetailDto> SetStatusAsync(int id, string status, CancellationToken ct)
    {
        if (!VehicleStatuses.All.Contains(status))
            throw new ValidationAppException(new Dictionary<string, string[]> { ["status"] = new[] { "Statut de véhicule invalide." } });
        var v = await _db.Vehicles.FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct)
            ?? throw new NotFoundException("VEHICLE_NOT_FOUND", "Le véhicule n'existe pas.");
        var old = v.Status;
        v.Status = status;
        v.IsActive = status != VehicleStatuses.OutOfService;
        v.UpdatedAt = DateTime.UtcNow;
        v.UpdatedBy = _current.UserId;
        _audit.Add("Vehicle", v.Id, AuditActions.Update, $"Véhicule {v.PlateNumber} : statut {old} → {status}.", new { Status = old }, new { Status = status });
        await _db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    private static string NormalizePlate(string plate) => plate.Trim().ToUpperInvariant().Replace(' ', '-');

    private static void Apply(Vehicle v, VehicleUpsertRequest r)
    {
        v.Brand = r.Brand.Trim();
        v.Model = r.Model.Trim();
        v.Type = r.Type.Trim();
        v.CapacityKg = r.CapacityKg;
        v.CapacityM3 = r.CapacityM3;
        if (r.Status is { } s) { v.Status = s; v.IsActive = s != VehicleStatuses.OutOfService; }
    }
}
