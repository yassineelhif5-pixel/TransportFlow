using Microsoft.EntityFrameworkCore;
using Transport.Domain.Entities;

namespace Transport.Application.Interfaces;

/// <summary>Abstraction du DbContext : la couche Application ne connaît pas SQL Server.</summary>
public interface IApplicationDbContext
{
    DbSet<Role> Roles { get; }
    DbSet<User> Users { get; }
    DbSet<Driver> Drivers { get; }
    DbSet<Vehicle> Vehicles { get; }
    DbSet<Client> Clients { get; }
    DbSet<Reference> References { get; }
    DbSet<Location> Locations { get; }
    DbSet<Mission> Missions { get; }
    DbSet<MissionStatus> MissionStatuses { get; }
    DbSet<MissionStatusHistory> MissionStatusHistories { get; }
    DbSet<MissionAssignment> MissionAssignments { get; }
    DbSet<DocumentType> DocumentTypes { get; }
    DbSet<Document> Documents { get; }
    DbSet<AuditLog> AuditLogs { get; }
    DbSet<Notification> Notifications { get; }
    DbSet<SystemParameter> SystemParameters { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
    Task<ITransactionScope> BeginTransactionAsync(CancellationToken ct = default);
}

public interface ITransactionScope : IAsyncDisposable
{
    Task CommitAsync(CancellationToken ct = default);
}

/// <summary>Utilisateur courant extrait du JWT validé.</summary>
public interface ICurrentUserService
{
    int? UserId { get; }
    string? Username { get; }
    string? Role { get; }
    bool IsAdmin { get; }
    string? IpAddress { get; }
    string? UserAgent { get; }
    int RequireUserId();
}

public interface IPasswordHasherService
{
    string Hash(string password);
    bool Verify(string hash, string password, out bool needsRehash);
}

public record TokenResult(string AccessToken, DateTime ExpiresAt, int ExpiresIn);

public interface ITokenService
{
    TokenResult CreateAccessToken(User user, string roleCode);
    string CreateRefreshToken();
    string HashRefreshToken(string refreshToken);
    TimeSpan RefreshTokenLifetime { get; }
}

public record StoredFile(string StorageKey, long Size, string Sha256);

/// <summary>Abstraction du stockage documentaire (local aujourd'hui, Azure Blob / Object Storage demain).</summary>
public interface IFileStorageService
{
    Task<StoredFile> UploadAsync(Stream content, string extension, CancellationToken ct = default);
    Task<Stream> DownloadAsync(string storageKey, CancellationToken ct = default);
    Task DeleteAsync(string storageKey, CancellationToken ct = default);
    Task<bool> ExistsAsync(string storageKey, CancellationToken ct = default);
    Task<bool> IsHealthyAsync(CancellationToken ct = default);
}

/// <summary>Lecture/écriture CSV et XLSX sans dépendance tierce.</summary>
public interface ISpreadsheetService
{
    /// <summary>Retourne la ligne d'en-tête puis les lignes de données (tableaux de cellules).</summary>
    Task<IReadOnlyList<string[]>> ReadAsync(Stream stream, string extension, CancellationToken ct = default);
    byte[] WriteCsv(IReadOnlyList<string> headers, IEnumerable<IReadOnlyList<string?>> rows);
    byte[] WriteXlsx(string sheetName, IReadOnlyList<string> headers, IEnumerable<IReadOnlyList<string?>> rows);
}

public interface IAuditService
{
    /// <summary>Ajoute une entrée d'audit au contexte (persistée avec le SaveChanges métier).</summary>
    void Add(string entityName, object? entityId, string action, string description, object? oldValue = null, object? newValue = null, int? userIdOverride = null);
}

public interface INotificationService
{
    /// <summary>Notifie tous les administrateurs actifs (ajout au contexte, sans SaveChanges).</summary>
    Task NotifyAdminsAsync(string title, string message, string type, string? entityName = null, int? entityId = null, CancellationToken ct = default);
    void NotifyUser(int userId, string title, string message, string type, string? entityName = null, int? entityId = null);
}
