using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Transport.Application.Common;
using Transport.Application.Interfaces;
using Transport.Application.Missions;
using Transport.Domain.Entities;
using Transport.Domain.Enums;

namespace Transport.Application.References;

public record ReferenceDto(int Id, string Number, int ClientId, string ClientName, string ClientCode, string Source, string Status,
    string? Notes, DateTime CreatedAt, int? MissionId, string? MissionStatusCode, string? MissionStatusLabel);

public class ReferenceQuery : PagedQuery
{
    public string? Status { get; set; }
    public string? Source { get; set; }
    public int? ClientId { get; set; }
    /// <summary>true : uniquement les références sans mission (utile pour le formulaire mission).</summary>
    public bool? Available { get; set; }
}

public record ReferenceUpsertRequest(string Number, int ClientId, string? Notes, string? Status = null);

public record ImportErrorDto(int Line, string Field, string Message, string? Value);
public record ImportRowDto(int Line, string Number, string ClientCode, string ClientName, string? Notes);
public record ImportResultDto(string FileName, int TotalRows, int ValidRows, int ErrorRows,
    IReadOnlyList<ImportErrorDto> Errors, IReadOnlyList<ImportRowDto> Preview, bool Committed, int Imported);

public class ReferenceUpsertRequestValidator : AbstractValidator<ReferenceUpsertRequest>
{
    public ReferenceUpsertRequestValidator()
    {
        RuleFor(x => x.Number).NotEmpty().WithMessage("La référence est obligatoire.")
            .Matches(ReferenceFormat.Pattern).WithMessage(ReferenceFormat.Message);
        RuleFor(x => x.ClientId).GreaterThan(0).WithMessage("Le client est obligatoire.");
        RuleFor(x => x.Notes).MaximumLength(1000);
        RuleFor(x => x.Status).Must(s => s is null || s == ReferenceStatuses.Open || s == ReferenceStatuses.Cancelled)
            .WithMessage("Statut de référence invalide.");
    }
}

public interface IReferenceService
{
    Task<PagedResult<ReferenceDto>> ListAsync(ReferenceQuery q, CancellationToken ct);
    IQueryable<ReferenceDto> Query(ReferenceQuery q);
    Task<ReferenceDto> GetAsync(int id, CancellationToken ct);
    Task<ReferenceDto> CreateAsync(ReferenceUpsertRequest r, CancellationToken ct);
    Task<ReferenceDto> UpdateAsync(int id, ReferenceUpsertRequest r, CancellationToken ct);
    Task DeleteAsync(int id, CancellationToken ct);
    Task<ImportResultDto> ImportAsync(Stream file, string fileName, bool commit, CancellationToken ct);
}

public class ReferenceService : IReferenceService
{
    public const int MaxImportRows = 5000;
    private static readonly Regex NumberRegex = new(ReferenceFormat.Pattern, RegexOptions.Compiled);

    private readonly IApplicationDbContext _db;
    private readonly ICurrentUserService _current;
    private readonly IAuditService _audit;
    private readonly INotificationService _notifications;
    private readonly ISpreadsheetService _sheets;
    private readonly IValidator<ReferenceUpsertRequest> _validator;

    public ReferenceService(IApplicationDbContext db, ICurrentUserService current, IAuditService audit,
        INotificationService notifications, ISpreadsheetService sheets, IValidator<ReferenceUpsertRequest> validator)
    {
        _db = db; _current = current; _audit = audit; _notifications = notifications; _sheets = sheets; _validator = validator;
    }

    public IQueryable<ReferenceDto> Query(ReferenceQuery q)
    {
        var query = _db.References.AsNoTracking().Where(r => !r.IsDeleted);
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(r => r.Number.Contains(s) || r.Client.Name.Contains(s) || r.Client.Code.Contains(s));
        }
        if (!string.IsNullOrWhiteSpace(q.Status)) query = query.Where(r => r.Status == q.Status);
        if (!string.IsNullOrWhiteSpace(q.Source)) query = query.Where(r => r.Source == q.Source);
        if (q.ClientId is { } c) query = query.Where(r => r.ClientId == c);
        if (q.Available == true) query = query.Where(r => r.Status == ReferenceStatuses.Open && !r.Missions.Any(m => !m.IsDeleted));

        query = q.SortBy?.ToLowerInvariant() switch
        {
            "number" => query.OrderByDir(r => r.Number, q.Descending),
            "client" => query.OrderByDir(r => r.Client.Name, q.Descending),
            "status" => query.OrderByDir(r => r.Status, q.Descending),
            "source" => query.OrderByDir(r => r.Source, q.Descending),
            _ => query.OrderByDir(r => r.CreatedAt, q.DescendingOrDefault),
        };

        return query.Select(r => new ReferenceDto(r.Id, r.Number, r.ClientId, r.Client.Name, r.Client.Code, r.Source, r.Status, r.Notes, r.CreatedAt,
            r.Missions.Where(m => !m.IsDeleted).Select(m => (int?)m.Id).FirstOrDefault(),
            r.Missions.Where(m => !m.IsDeleted).Select(m => m.CurrentStatus.Code).FirstOrDefault(),
            r.Missions.Where(m => !m.IsDeleted).Select(m => m.CurrentStatus.Label).FirstOrDefault()));
    }

    public Task<PagedResult<ReferenceDto>> ListAsync(ReferenceQuery q, CancellationToken ct) => Query(q).ToPagedAsync(q, ct);

    public async Task<ReferenceDto> GetAsync(int id, CancellationToken ct) =>
        await Query(new ReferenceQuery()).FirstOrDefaultAsync(r => r.Id == id, ct)
        ?? throw new NotFoundException("REFERENCE_NOT_FOUND", "La référence n'existe pas.");

    public async Task<ReferenceDto> CreateAsync(ReferenceUpsertRequest r, CancellationToken ct)
    {
        await _validator.EnsureValidAsync(r, ct);
        var number = r.Number.Trim().ToUpperInvariant();
        await EnsureClientAsync(r.ClientId, ct);
        if (await _db.References.AnyAsync(x => x.Number == number, ct))
            throw new ConflictException("REFERENCE_ALREADY_EXISTS", $"La référence {number} existe déjà.");

        var entity = new Reference
        {
            Number = number, ClientId = r.ClientId, Notes = TextUtils.Clean(r.Notes),
            Source = ReferenceSources.Manual, Status = ReferenceStatuses.Open, CreatedBy = _current.UserId, CreatedAt = DateTime.UtcNow,
        };
        _db.References.Add(entity);
        await _db.SaveChangesAsync(ct);
        _audit.Add("Reference", entity.Id, AuditActions.Create, $"Référence {number} créée.", newValue: new { number, r.ClientId });
        await _db.SaveChangesAsync(ct);
        return await GetAsync(entity.Id, ct);
    }

    public async Task<ReferenceDto> UpdateAsync(int id, ReferenceUpsertRequest r, CancellationToken ct)
    {
        await _validator.EnsureValidAsync(r, ct);
        var entity = await _db.References.Include(x => x.Missions)
            .FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct)
            ?? throw new NotFoundException("REFERENCE_NOT_FOUND", "La référence n'existe pas.");
        var number = r.Number.Trim().ToUpperInvariant();
        var hasMission = entity.Missions.Any(m => !m.IsDeleted);

        if (hasMission && (number != entity.Number || r.ClientId != entity.ClientId))
            throw new BusinessRuleException("REFERENCE_IN_USE", "Cette référence est liée à une mission : numéro et client ne sont plus modifiables.");
        if (number != entity.Number && await _db.References.AnyAsync(x => x.Number == number && x.Id != id, ct))
            throw new ConflictException("REFERENCE_ALREADY_EXISTS", $"La référence {number} existe déjà.");
        if (r.ClientId != entity.ClientId) await EnsureClientAsync(r.ClientId, ct);

        var before = new { entity.Number, entity.ClientId, entity.Notes, entity.Status };
        entity.Number = number;
        entity.ClientId = r.ClientId;
        entity.Notes = TextUtils.Clean(r.Notes);
        if (r.Status is { } status && !hasMission) entity.Status = status;
        entity.UpdatedAt = DateTime.UtcNow;
        entity.UpdatedBy = _current.UserId;
        _audit.Add("Reference", entity.Id, AuditActions.Update, $"Référence {number} modifiée.", before,
            new { entity.Number, entity.ClientId, entity.Notes, entity.Status });
        await _db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task DeleteAsync(int id, CancellationToken ct)
    {
        var entity = await _db.References.Include(x => x.Missions)
            .FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct)
            ?? throw new NotFoundException("REFERENCE_NOT_FOUND", "La référence n'existe pas.");
        if (entity.Missions.Any(m => !m.IsDeleted))
            throw new BusinessRuleException("REFERENCE_IN_USE", "Impossible de supprimer une référence liée à une mission.");
        entity.IsDeleted = true;
        entity.Status = ReferenceStatuses.Cancelled;
        entity.UpdatedAt = DateTime.UtcNow;
        entity.UpdatedBy = _current.UserId;
        _audit.Add("Reference", entity.Id, AuditActions.Delete, $"Référence {entity.Number} supprimée (suppression logique).");
        await _db.SaveChangesAsync(ct);
    }

    // ------------------------------------------------------------------ Import

    public async Task<ImportResultDto> ImportAsync(Stream file, string fileName, bool commit, CancellationToken ct)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        if (ext is not (".csv" or ".xlsx"))
            throw new AppException("IMPORT_INVALID_FORMAT", "Format non pris en charge. Utilisez un fichier .csv ou .xlsx.");

        IReadOnlyList<string[]> rows;
        try { rows = await _sheets.ReadAsync(file, ext, ct); }
        catch (Exception ex) when (ex is not AppException)
        {
            throw new AppException("IMPORT_UNREADABLE", "Le fichier est illisible ou corrompu.");
        }
        if (rows.Count == 0) throw new AppException("IMPORT_EMPTY", "Le fichier est vide.");

        var header = rows[0].Select(Normalize).ToArray();
        int Col(params string[] names) => Array.FindIndex(header, h => names.Contains(h));
        var numberCol = Col("reference", "ref", "numero", "numero reference", "reference number", "number");
        var clientCol = Col("client", "code client", "client code", "nom client", "client name");
        var notesCol = Col("notes", "note", "commentaire", "description");
        if (numberCol < 0 || clientCol < 0)
            throw new AppException("IMPORT_MISSING_COLUMNS", "Colonnes obligatoires manquantes : « Référence » et « Client ».");

        var dataRows = rows.Skip(1).Select((cells, i) => (cells, line: i + 2))
            .Where(r => r.cells.Any(c => !string.IsNullOrWhiteSpace(c))).ToList();
        if (dataRows.Count > MaxImportRows)
            throw new AppException("IMPORT_TOO_LARGE", $"Le fichier dépasse la limite de {MaxImportRows} lignes.");

        var clients = await _db.Clients.AsNoTracking().Where(c => !c.IsDeleted && c.IsActive)
            .Select(c => new { c.Id, c.Code, c.Name }).ToListAsync(ct);
        var byCode = clients.GroupBy(c => c.Code.ToUpperInvariant()).ToDictionary(g => g.Key, g => g.First());
        var byName = clients.GroupBy(c => c.Name.ToUpperInvariant()).ToDictionary(g => g.Key, g => g.First());

        var numbers = dataRows.Select(r => Cell(r.cells, numberCol).ToUpperInvariant()).Where(n => n.Length > 0).Distinct().ToList();
        var existing = new HashSet<string>(await _db.References.Where(r => numbers.Contains(r.Number)).Select(r => r.Number).ToListAsync(ct));

        var errors = new List<ImportErrorDto>();
        var valid = new List<(ImportRowDto row, int clientId)>();
        var seen = new HashSet<string>();

        foreach (var (cells, line) in dataRows)
        {
            var number = Cell(cells, numberCol).ToUpperInvariant();
            var clientKey = Cell(cells, clientCol);
            var notes = notesCol >= 0 ? TextUtils.Clean(Cell(cells, notesCol)) : null;
            var before = errors.Count;

            if (number.Length == 0) errors.Add(new(line, "Référence", "Référence obligatoire", null));
            else if (!NumberRegex.IsMatch(number)) errors.Add(new(line, "Référence", "Format de référence invalide", number));
            else if (existing.Contains(number)) errors.Add(new(line, "Référence", "Référence déjà existante", number));
            else if (!seen.Add(number)) errors.Add(new(line, "Référence", "Référence en double dans le fichier", number));

            var client = clientKey.Length == 0 ? null
                : byCode.GetValueOrDefault(clientKey.ToUpperInvariant()) ?? byName.GetValueOrDefault(clientKey.ToUpperInvariant());
            if (clientKey.Length == 0) errors.Add(new(line, "Client", "Client obligatoire", null));
            else if (client is null) errors.Add(new(line, "Client", "Client introuvable", clientKey));

            if (notes is { Length: > 1000 }) errors.Add(new(line, "Notes", "Notes trop longues (1000 caractères max.)", null));

            if (errors.Count == before && client is not null)
                valid.Add((new ImportRowDto(line, number, client.Code, client.Name, notes), client.Id));
        }

        var imported = 0;
        if (commit)
        {
            if (valid.Count == 0)
                throw new BusinessRuleException("IMPORT_NOTHING_TO_IMPORT", "Aucune ligne valide à importer.");

            foreach (var (row, clientId) in valid)
            {
                _db.References.Add(new Reference
                {
                    Number = row.Number, ClientId = clientId, Notes = row.Notes, Source = ReferenceSources.Import,
                    Status = ReferenceStatuses.Open, CreatedBy = _current.UserId, CreatedAt = DateTime.UtcNow,
                });
            }
            imported = valid.Count;
            _audit.Add("Reference", null, AuditActions.Import,
                $"Import « {Path.GetFileName(fileName)} » : {imported} référence(s) importée(s), {dataRows.Count - imported} ligne(s) ignorée(s).",
                newValue: new { file = Path.GetFileName(fileName), total = dataRows.Count, imported, errors = errors.Count });
            await _notifications.NotifyAdminsAsync("Import terminé", $"{imported} référence(s) importée(s) depuis {Path.GetFileName(fileName)}.",
                NotificationTypes.Success, "Reference", null, ct);
            await _db.SaveChangesAsync(ct);
        }

        var errorLines = errors.Select(e => e.Line).Distinct().Count();
        return new ImportResultDto(Path.GetFileName(fileName), dataRows.Count, valid.Count, errorLines,
            errors.Take(500).ToList(), valid.Take(100).Select(v => v.row).ToList(), commit, imported);
    }

    private static string Cell(string[] cells, int index) => index < cells.Length ? (cells[index] ?? "").Trim() : "";

    private static string Normalize(string header)
    {
        var formD = (header ?? "").Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder();
        foreach (var ch in formD)
            if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark) sb.Append(ch is '_' or '-' ? ' ' : ch);
        return sb.ToString().Trim().TrimStart('﻿');
    }

    private async Task EnsureClientAsync(int clientId, CancellationToken ct)
    {
        var client = await _db.Clients.AsNoTracking().FirstOrDefaultAsync(c => c.Id == clientId && !c.IsDeleted, ct)
            ?? throw new NotFoundException("CLIENT_NOT_FOUND", "Le client sélectionné n'existe pas.");
        if (!client.IsActive) throw new BusinessRuleException("CLIENT_INACTIVE", $"Le client {client.Name} est désactivé.");
    }
}
