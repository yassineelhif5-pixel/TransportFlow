using Microsoft.EntityFrameworkCore;
using Transport.Application.Common;
using Transport.Application.Interfaces;
using Transport.Domain.Entities;
using Transport.Domain.Enums;

namespace Transport.Application.Documents;

public record DocumentDto(int Id, int MissionId, string ReferenceNumber, int DocumentTypeId, string DocumentTypeCode, string DocumentTypeLabel,
    string FileName, string FileExtension, string MimeType, long FileSize, string UploadedByName, DateTime UploadedAt, string? Comment);

public record DocumentTypeDto(int Id, string Code, string Label);

public record DocumentContent(Stream Content, string FileName, string MimeType);

public record UploadDocumentCommand(int MissionId, int DocumentTypeId, string? Comment, string FileName, string? ContentType, long Length, Stream Content);

public class DocumentQuery : PagedQuery
{
    public int? MissionId { get; set; }
    public int? DocumentTypeId { get; set; }
    public string? Extension { get; set; }
}

/// <summary>Politique d'upload (configurable dans appsettings : Storage:MaxFileSizeMb).</summary>
public class DocumentPolicy
{
    public long MaxFileSizeBytes { get; set; } = 10 * 1024 * 1024;

    /// <summary>Extensions autorisées → types MIME acceptés.</summary>
    public static readonly IReadOnlyDictionary<string, string[]> Allowed = new Dictionary<string, string[]>
    {
        [".pdf"] = new[] { "application/pdf" },
        [".jpg"] = new[] { "image/jpeg", "image/pjpeg" },
        [".jpeg"] = new[] { "image/jpeg", "image/pjpeg" },
        [".png"] = new[] { "image/png" },
        [".docx"] = new[] { "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip", "application/octet-stream" },
    };

    public static string CanonicalMime(string ext) => Allowed[ext][0];

    /// <summary>Vérifie la signature binaire (magic bytes) : le contenu doit correspondre à l'extension.</summary>
    public static bool SignatureMatches(string ext, ReadOnlySpan<byte> head) => ext switch
    {
        ".pdf" => head.Length >= 4 && head[0] == 0x25 && head[1] == 0x50 && head[2] == 0x44 && head[3] == 0x46,
        ".jpg" or ".jpeg" => head.Length >= 3 && head[0] == 0xFF && head[1] == 0xD8 && head[2] == 0xFF,
        ".png" => head.Length >= 8 && head[0] == 0x89 && head[1] == 0x50 && head[2] == 0x4E && head[3] == 0x47 && head[4] == 0x0D && head[5] == 0x0A && head[6] == 0x1A && head[7] == 0x0A,
        ".docx" => head.Length >= 4 && head[0] == 0x50 && head[1] == 0x4B && head[2] == 0x03 && head[3] == 0x04,
        _ => false,
    };

    /// <summary>Nom d'affichage nettoyé : jamais utilisé comme nom physique.</summary>
    public static string SanitizeFileName(string fileName)
    {
        var name = Path.GetFileName(fileName.Replace('\\', '/'));
        var invalid = Path.GetInvalidFileNameChars().Concat(new[] { '<', '>', ':', '"', '|', '?', '*' }).ToHashSet();
        var clean = new string(name.Where(c => !char.IsControl(c) && !invalid.Contains(c)).ToArray()).Trim().TrimStart('.');
        if (clean.Length == 0) clean = "document";
        if (clean.Length > 200)
        {
            var ext = Path.GetExtension(clean);
            clean = clean[..(200 - ext.Length)] + ext;
        }
        return clean;
    }
}

public interface IDocumentService
{
    Task<PagedResult<DocumentDto>> ListAsync(DocumentQuery q, CancellationToken ct, int? restrictToDriverId = null);
    Task<IReadOnlyList<DocumentDto>> ListForMissionAsync(int missionId, CancellationToken ct, int? restrictToDriverId = null);
    Task<DocumentDto> UploadAsync(UploadDocumentCommand cmd, CancellationToken ct, int? restrictToDriverId = null);
    Task<DocumentContent> DownloadAsync(int id, CancellationToken ct, int? restrictToDriverId = null);
    Task DeleteAsync(int id, CancellationToken ct);
    Task<IReadOnlyList<DocumentTypeDto>> GetTypesAsync(CancellationToken ct);
}

public class DocumentService : IDocumentService
{
    private readonly IApplicationDbContext _db;
    private readonly ICurrentUserService _current;
    private readonly IAuditService _audit;
    private readonly IFileStorageService _storage;
    private readonly DocumentPolicy _policy;

    public DocumentService(IApplicationDbContext db, ICurrentUserService current, IAuditService audit, IFileStorageService storage, DocumentPolicy policy)
    {
        _db = db; _current = current; _audit = audit; _storage = storage; _policy = policy;
    }

    private IQueryable<DocumentDto> Query(DocumentQuery q, int? restrictToDriverId)
    {
        var query = _db.Documents.AsNoTracking().Where(d => !d.IsDeleted && !d.Mission.IsDeleted);
        if (restrictToDriverId is { } drv) query = query.Where(d => d.Mission.CurrentDriverId == drv);
        if (q.MissionId is { } m) query = query.Where(d => d.MissionId == m);
        if (q.DocumentTypeId is { } t) query = query.Where(d => d.DocumentTypeId == t);
        if (!string.IsNullOrWhiteSpace(q.Extension)) query = query.Where(d => d.FileExtension == q.Extension);
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(d => d.FileName.Contains(s) || d.Mission.Reference.Number.Contains(s) || d.DocumentType.Label.Contains(s));
        }
        query = q.SortBy?.ToLowerInvariant() switch
        {
            "name" => query.OrderByDir(d => d.FileName, q.Descending),
            "size" => query.OrderByDir(d => d.FileSize, q.Descending),
            "type" => query.OrderByDir(d => d.DocumentType.Label, q.Descending),
            "reference" => query.OrderByDir(d => d.Mission.Reference.Number, q.Descending),
            _ => query.OrderByDir(d => d.UploadedAt, q.DescendingOrDefault),
        };
        return query.Select(d => new DocumentDto(d.Id, d.MissionId, d.Mission.Reference.Number, d.DocumentTypeId, d.DocumentType.Code, d.DocumentType.Label,
            d.FileName, d.FileExtension, d.MimeType, d.FileSize, d.UploadedByUser.FirstName + " " + d.UploadedByUser.LastName, d.UploadedAt, d.Comment));
    }

    public Task<PagedResult<DocumentDto>> ListAsync(DocumentQuery q, CancellationToken ct, int? restrictToDriverId = null) =>
        Query(q, restrictToDriverId).ToPagedAsync(q, ct);

    public async Task<IReadOnlyList<DocumentDto>> ListForMissionAsync(int missionId, CancellationToken ct, int? restrictToDriverId = null)
    {
        await RequireMissionAsync(missionId, restrictToDriverId, ct);
        return await Query(new DocumentQuery { MissionId = missionId }, restrictToDriverId).ToListAsync(ct);
    }

    public async Task<DocumentDto> UploadAsync(UploadDocumentCommand cmd, CancellationToken ct, int? restrictToDriverId = null)
    {
        var userId = _current.RequireUserId();
        var mission = await RequireMissionAsync(cmd.MissionId, restrictToDriverId, ct);

        var docType = await _db.DocumentTypes.FirstOrDefaultAsync(t => t.Id == cmd.DocumentTypeId, ct)
            ?? throw new ValidationAppException(new Dictionary<string, string[]> { ["documentTypeId"] = new[] { "Type de document inconnu." } });

        if (cmd.Length <= 0) throw Invalid("file", "Le fichier est vide.");
        if (cmd.Length > _policy.MaxFileSizeBytes)
            throw Invalid("file", $"Le fichier dépasse la taille maximale de {_policy.MaxFileSizeBytes / (1024 * 1024)} Mo.");

        var displayName = DocumentPolicy.SanitizeFileName(cmd.FileName);
        var ext = Path.GetExtension(displayName).ToLowerInvariant();
        if (!DocumentPolicy.Allowed.TryGetValue(ext, out var mimes))
            throw Invalid("file", "Format non autorisé. Formats acceptés : PDF, JPG, PNG, DOCX.");
        var declared = (cmd.ContentType ?? "").Split(';')[0].Trim().ToLowerInvariant();
        if (declared.Length > 0 && !mimes.Contains(declared))
            throw Invalid("file", "Le type du fichier ne correspond pas à son extension.");
        if (cmd.Comment is { Length: > 500 }) throw Invalid("comment", "Le commentaire est limité à 500 caractères.");

        // Copie bornée en mémoire pour contrôler la signature réelle du contenu.
        using var buffer = new MemoryStream();
        await CopyLimitedAsync(cmd.Content, buffer, _policy.MaxFileSizeBytes, ct);
        var head = new byte[(int)Math.Min(16, buffer.Length)];
        Array.Copy(buffer.GetBuffer(), head, head.Length);
        if (!DocumentPolicy.SignatureMatches(ext, head))
            throw Invalid("file", "Le contenu du fichier ne correspond pas à un fichier " + ext.TrimStart('.').ToUpperInvariant() + " valide.");
        buffer.Position = 0;

        var stored = await _storage.UploadAsync(buffer, ext, ct);
        var doc = new Document
        {
            MissionId = mission.Id, DocumentTypeId = docType.Id, FileName = displayName, StoragePath = stored.StorageKey,
            FileExtension = ext, MimeType = DocumentPolicy.CanonicalMime(ext), FileSize = stored.Size, Sha256 = stored.Sha256,
            UploadedBy = userId, UploadedAt = DateTime.UtcNow, Comment = TextUtils.Clean(cmd.Comment),
        };
        _db.Documents.Add(doc);
        mission.LastAction = $"Document ajouté : {docType.Label}";
        mission.LastActionAt = DateTime.UtcNow;

        try
        {
            await _db.SaveChangesAsync(ct);
            _audit.Add("Document", doc.Id, AuditActions.DocumentUpload,
                $"Document « {displayName} » ({docType.Label}) ajouté à la mission {mission.Reference.Number}.",
                newValue: new { missionId = mission.Id, reference = mission.Reference.Number, file = displayName, type = docType.Code, size = stored.Size });
            await _db.SaveChangesAsync(ct);
        }
        catch
        {
            await _storage.DeleteAsync(stored.StorageKey, CancellationToken.None); // pas de fichier orphelin
            throw;
        }

        return await Query(new DocumentQuery(), null).FirstAsync(d => d.Id == doc.Id, ct);
    }

    public async Task<DocumentContent> DownloadAsync(int id, CancellationToken ct, int? restrictToDriverId = null)
    {
        var doc = await _db.Documents.Include(d => d.Mission).ThenInclude(m => m.Reference)
            .FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted, ct)
            ?? throw new NotFoundException("DOCUMENT_NOT_FOUND", "Le document n'existe pas.");
        if (restrictToDriverId is { } drv && doc.Mission.CurrentDriverId != drv)
            throw new NotFoundException("DOCUMENT_NOT_FOUND", "Le document n'existe pas.");
        if (!await _storage.ExistsAsync(doc.StoragePath, ct))
            throw new NotFoundException("DOCUMENT_FILE_MISSING", "Le fichier est introuvable dans le stockage documentaire.");

        var stream = await _storage.DownloadAsync(doc.StoragePath, ct);
        _audit.Add("Document", doc.Id, AuditActions.DocumentDownload, $"Téléchargement de « {doc.FileName} » (mission {doc.Mission.Reference.Number}).");
        await _db.SaveChangesAsync(ct);
        return new DocumentContent(stream, doc.FileName, doc.MimeType);
    }

    public async Task DeleteAsync(int id, CancellationToken ct)
    {
        var doc = await _db.Documents.Include(d => d.Mission).ThenInclude(m => m.Reference)
            .FirstOrDefaultAsync(d => d.Id == id && !d.IsDeleted, ct)
            ?? throw new NotFoundException("DOCUMENT_NOT_FOUND", "Le document n'existe pas.");
        // Suppression logique : la trace métier et le fichier sont conservés.
        doc.IsDeleted = true;
        doc.DeletedAt = DateTime.UtcNow;
        doc.DeletedBy = _current.UserId;
        doc.Mission.LastAction = "Document supprimé";
        doc.Mission.LastActionAt = DateTime.UtcNow;
        _audit.Add("Document", doc.Id, AuditActions.DocumentDelete,
            $"Document « {doc.FileName} » supprimé de la mission {doc.Mission.Reference.Number}.",
            oldValue: new { missionId = doc.MissionId, file = doc.FileName });
        await _db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<DocumentTypeDto>> GetTypesAsync(CancellationToken ct) =>
        await _db.DocumentTypes.AsNoTracking().OrderBy(t => t.Id).Select(t => new DocumentTypeDto(t.Id, t.Code, t.Label)).ToListAsync(ct);

    private async Task<Mission> RequireMissionAsync(int missionId, int? restrictToDriverId, CancellationToken ct)
    {
        var mission = await _db.Missions.Include(m => m.Reference).FirstOrDefaultAsync(m => m.Id == missionId && !m.IsDeleted, ct)
            ?? throw new NotFoundException("MISSION_NOT_FOUND", "La mission n'existe pas.");
        if (restrictToDriverId is { } drv && mission.CurrentDriverId != drv)
            throw new NotFoundException("MISSION_NOT_FOUND", "La mission n'existe pas.");
        return mission;
    }

    private static async Task CopyLimitedAsync(Stream source, Stream target, long max, CancellationToken ct)
    {
        var buffer = new byte[81920];
        long total = 0;
        int read;
        while ((read = await source.ReadAsync(buffer, ct)) > 0)
        {
            total += read;
            if (total > max) throw Invalid("file", "Le fichier dépasse la taille maximale autorisée.");
            await target.WriteAsync(buffer.AsMemory(0, read), ct);
        }
    }

    private static ValidationAppException Invalid(string field, string message) =>
        new(new Dictionary<string, string[]> { [field] = new[] { message } });
}
