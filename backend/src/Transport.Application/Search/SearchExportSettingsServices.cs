using Microsoft.EntityFrameworkCore;
using Transport.Application.Common;
using Transport.Application.Drivers;
using Transport.Application.History;
using Transport.Application.Interfaces;
using Transport.Application.Missions;
using Transport.Application.References;
using Transport.Domain.Enums;

namespace Transport.Application.Search;

public record SearchResultDto(string Type, int Id, string Title, string? Subtitle, string? Meta, string? StatusCode, string? StatusLabel, int? MissionId);

public interface ISearchService
{
    Task<IReadOnlyList<SearchResultDto>> SearchAsync(string term, CancellationToken ct);
}

/// <summary>Recherche globale (en-tête) : références, missions, clients, chauffeurs.</summary>
public class SearchService : ISearchService
{
    private readonly IApplicationDbContext _db;
    public SearchService(IApplicationDbContext db) => _db = db;

    public async Task<IReadOnlyList<SearchResultDto>> SearchAsync(string term, CancellationToken ct)
    {
        var s = (term ?? "").Trim();
        if (s.Length < 2) return Array.Empty<SearchResultDto>();
        if (s.Length > 100) s = s[..100];
        var results = new List<SearchResultDto>();

        results.AddRange(await _db.Missions.AsNoTracking()
            .Where(m => !m.IsDeleted && (m.Reference.Number.Contains(s) || m.Client.Name.Contains(s)
                || (m.CurrentDriver != null && (m.CurrentDriver.LastName.Contains(s) || m.CurrentDriver.FirstName.Contains(s)))))
            .OrderByDescending(m => m.Reference.Number.StartsWith(s)).ThenByDescending(m => m.PlannedDate).Take(6)
            .Select(m => new SearchResultDto("mission", m.Id, m.Reference.Number, m.Client.Name,
                m.CurrentDriver != null ? m.CurrentDriver.FirstName + " " + m.CurrentDriver.LastName : "Non affectée",
                m.CurrentStatus.Code, m.CurrentStatus.Label, m.Id))
            .ToListAsync(ct));

        results.AddRange(await _db.References.AsNoTracking()
            .Where(r => !r.IsDeleted && r.Number.Contains(s) && !r.Missions.Any(m => !m.IsDeleted))
            .OrderBy(r => r.Number).Take(4)
            .Select(r => new SearchResultDto("reference", r.Id, r.Number, r.Client.Name, "Sans mission", null, null, null))
            .ToListAsync(ct));

        results.AddRange(await _db.Clients.AsNoTracking()
            .Where(c => !c.IsDeleted && (c.Name.Contains(s) || c.Code.Contains(s)))
            .OrderBy(c => c.Name).Take(4)
            .Select(c => new SearchResultDto("client", c.Id, c.Name, c.Code, c.City, null, null, null))
            .ToListAsync(ct));

        results.AddRange(await _db.Drivers.AsNoTracking()
            .Where(d => !d.IsDeleted && (d.LastName.Contains(s) || d.FirstName.Contains(s) || d.Phone.Contains(s)))
            .OrderBy(d => d.LastName).Take(4)
            .Select(d => new SearchResultDto("driver", d.Id, d.FirstName + " " + d.LastName, d.Phone, d.IsActive ? "Actif" : "Inactif", null, null, null))
            .ToListAsync(ct));

        return results;
    }
}

public record ExportFile(byte[] Content, string FileName, string ContentType);

public interface IExportService
{
    Task<ExportFile> ExportMissionsAsync(MissionQuery q, string format, CancellationToken ct);
    Task<ExportFile> ExportReferencesAsync(ReferenceQuery q, string format, CancellationToken ct);
    Task<ExportFile> ExportDriversAsync(DriverQuery q, string format, CancellationToken ct);
    Task<ExportFile> ExportHistoryAsync(HistoryQuery q, string format, CancellationToken ct);
}

/// <summary>Exports générés côté serveur (CSV UTF-8 « ; » compatible Excel FR, ou XLSX natif).</summary>
public class ExportService : IExportService
{
    public const int MaxRows = 50_000;
    private readonly IMissionService _missions;
    private readonly IReferenceService _references;
    private readonly IDriverService _drivers;
    private readonly IHistoryService _history;
    private readonly ISpreadsheetService _sheets;
    private readonly IAuditService _audit;
    private readonly IApplicationDbContext _db;

    public ExportService(IMissionService missions, IReferenceService references, IDriverService drivers, IHistoryService history,
        ISpreadsheetService sheets, IAuditService audit, IApplicationDbContext db)
    {
        _missions = missions; _references = references; _drivers = drivers; _history = history; _sheets = sheets; _audit = audit; _db = db;
    }

    public async Task<ExportFile> ExportMissionsAsync(MissionQuery q, string format, CancellationToken ct)
    {
        var rows = await _missions.FilteredQuery(q).OrderByDescending(m => m.PlannedDate).Take(MaxRows)
            .Select(m => new
            {
                Ref = m.Reference.Number, Client = m.Client.Name, m.PlannedDate, From = m.PickupLocation.City, To = m.DeliveryLocation.City,
                Driver = m.CurrentDriver != null ? m.CurrentDriver.FirstName + " " + m.CurrentDriver.LastName : null,
                Plate = m.CurrentVehicle != null ? m.CurrentVehicle.PlateNumber : null, Status = m.CurrentStatus.Label,
                m.Goods, m.WeightKg, m.VolumeM3, m.LastAction, m.LastActionAt,
            }).ToListAsync(ct);
        return await BuildAsync("missions", format,
            new[] { "Référence", "Client", "Date prévue", "Départ", "Destination", "Chauffeur", "Véhicule", "Statut", "Marchandise", "Poids (kg)", "Volume (m3)", "Dernière action", "Date dernière action" },
            rows.Select(r => (IReadOnlyList<string?>)new[] { r.Ref, r.Client, D(r.PlannedDate), r.From, r.To, r.Driver, r.Plate, r.Status, r.Goods, N(r.WeightKg), N(r.VolumeM3), r.LastAction, D(r.LastActionAt) }),
            rows.Count, ct);
    }

    public async Task<ExportFile> ExportReferencesAsync(ReferenceQuery q, string format, CancellationToken ct)
    {
        var rows = await _references.Query(q).Take(MaxRows).ToListAsync(ct);
        return await BuildAsync("references", format,
            new[] { "Référence", "Code client", "Client", "Source", "Statut", "Notes", "Date création", "Statut mission" },
            rows.Select(r => (IReadOnlyList<string?>)new[] { r.Number, r.ClientCode, r.ClientName, r.Source, r.Status, r.Notes, D(r.CreatedAt), r.MissionStatusLabel }),
            rows.Count, ct);
    }

    public async Task<ExportFile> ExportDriversAsync(DriverQuery q, string format, CancellationToken ct)
    {
        var rows = await _drivers.Query(q).Take(MaxRows).ToListAsync(ct);
        return await BuildAsync("chauffeurs", format,
            new[] { "Nom", "Prénom", "E-mail", "Téléphone", "N° permis", "Expiration permis", "Véhicule", "Statut", "Missions en cours" },
            rows.Select(r => (IReadOnlyList<string?>)new[] { r.LastName, r.FirstName, r.Email, r.Phone, r.LicenseNumber, r.LicenseExpiryDate.ToString("dd/MM/yyyy"), r.VehiclePlate, r.IsActive ? "Actif" : "Inactif", r.ActiveMissions.ToString() }),
            rows.Count, ct);
    }

    public async Task<ExportFile> ExportHistoryAsync(HistoryQuery q, string format, CancellationToken ct)
    {
        var rows = await _history.Query(q).Take(MaxRows).ToListAsync(ct);
        return await BuildAsync("historique", format,
            new[] { "Date", "Utilisateur", "Entité", "ID", "Action", "Description", "Adresse IP" },
            rows.Select(r => (IReadOnlyList<string?>)new[] { D(r.CreatedAt), r.UserName, r.EntityName, r.EntityId, r.Action, r.Description, r.IpAddress }),
            rows.Count, ct);
    }

    private async Task<ExportFile> BuildAsync(string name, string format, string[] headers, IEnumerable<IReadOnlyList<string?>> rows, int count, CancellationToken ct)
    {
        var stamp = DateTime.UtcNow.ToString("yyyyMMdd-HHmm");
        var isXlsx = string.Equals(format, "xlsx", StringComparison.OrdinalIgnoreCase);
        var content = isXlsx ? _sheets.WriteXlsx(name, headers, rows) : _sheets.WriteCsv(headers, rows);
        _audit.Add("Export", name, AuditActions.Export, $"Export {name} ({count} ligne(s), {(isXlsx ? "Excel" : "CSV")}).");
        await _db.SaveChangesAsync(ct);
        return new ExportFile(content, $"transportflow-{name}-{stamp}.{(isXlsx ? "xlsx" : "csv")}",
            isXlsx ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8");
    }

    private static string? D(DateTime? d) => d?.ToString("dd/MM/yyyy HH:mm");
    private static string? N(decimal? n) => n?.ToString("0.##", System.Globalization.CultureInfo.GetCultureInfo("fr-FR"));
}

public record SystemParameterDto(int Id, string Key, string Value, string? Description, DateTime? UpdatedAt);
public record SystemParameterUpdate(string Key, string Value);

public interface ISettingsService
{
    Task<IReadOnlyList<SystemParameterDto>> ListAsync(CancellationToken ct);
    Task<IReadOnlyList<SystemParameterDto>> UpdateAsync(IReadOnlyList<SystemParameterUpdate> updates, CancellationToken ct);
}

public class SettingsService : ISettingsService
{
    private readonly IApplicationDbContext _db;
    private readonly ICurrentUserService _current;
    private readonly IAuditService _audit;

    public SettingsService(IApplicationDbContext db, ICurrentUserService current, IAuditService audit)
    {
        _db = db; _current = current; _audit = audit;
    }

    public async Task<IReadOnlyList<SystemParameterDto>> ListAsync(CancellationToken ct) =>
        await _db.SystemParameters.AsNoTracking().OrderBy(p => p.Key)
            .Select(p => new SystemParameterDto(p.Id, p.Key, p.Value, p.Description, p.UpdatedAt)).ToListAsync(ct);

    public async Task<IReadOnlyList<SystemParameterDto>> UpdateAsync(IReadOnlyList<SystemParameterUpdate> updates, CancellationToken ct)
    {
        var keys = updates.Select(u => u.Key).ToList();
        var parameters = await _db.SystemParameters.Where(p => keys.Contains(p.Key)).ToListAsync(ct);
        foreach (var u in updates)
        {
            var p = parameters.FirstOrDefault(x => x.Key == u.Key)
                ?? throw new NotFoundException("PARAMETER_NOT_FOUND", $"Paramètre {u.Key} inconnu.");
            var value = (u.Value ?? "").Trim();
            if (value.Length > 500) throw new ValidationAppException(new Dictionary<string, string[]> { [u.Key] = new[] { "Valeur trop longue (500 caractères max.)." } });
            if (p.Value == value) continue;
            _audit.Add("SystemParameter", p.Key, AuditActions.Update, $"Paramètre {p.Key} modifié.", new { p.Value }, new { Value = value });
            p.Value = value;
            p.UpdatedAt = DateTime.UtcNow;
            p.UpdatedBy = _current.UserId;
        }
        await _db.SaveChangesAsync(ct);
        return await ListAsync(ct);
    }
}
