using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Transport.Application.Interfaces;
using Transport.Domain.Entities;
using Transport.Domain.Enums;

namespace Transport.Application.Services;

public class AuditService : IAuditService
{
    // Encodeur « relaxed » : les accents restent lisibles dans le journal (les valeurs ne sont jamais injectées en HTML).
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = false, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    private readonly IApplicationDbContext _db;
    private readonly ICurrentUserService _current;

    public AuditService(IApplicationDbContext db, ICurrentUserService current)
    {
        _db = db; _current = current;
    }

    public void Add(string entityName, object? entityId, string action, string description,
        object? oldValue = null, object? newValue = null, int? userIdOverride = null)
    {
        _db.AuditLogs.Add(new AuditLog
        {
            UserId = userIdOverride ?? _current.UserId,
            EntityName = entityName,
            EntityId = entityId?.ToString(),
            Action = action,
            Description = Limit(description, 1000),
            OldValue = Serialize(oldValue),
            NewValue = Serialize(newValue),
            IpAddress = Limit(_current.IpAddress, 64),
            UserAgent = Limit(_current.UserAgent, 512),
            CreatedAt = DateTime.UtcNow,
        });
    }

    private static string? Serialize(object? value) => value switch
    {
        null => null,
        string s => Limit(s, 4000),
        _ => Limit(JsonSerializer.Serialize(value, JsonOpts), 4000),
    };

    private static string? Limit(string? v, int max) => v is null ? null : v.Length <= max ? v : v[..max];
}

public class NotificationService : INotificationService
{
    private readonly IApplicationDbContext _db;

    public NotificationService(IApplicationDbContext db) => _db = db;

    public async Task NotifyAdminsAsync(string title, string message, string type, string? entityName = null, int? entityId = null, CancellationToken ct = default)
    {
        var adminIds = await _db.Users
            .Where(u => u.IsActive && !u.IsDeleted && u.Role.Code == RoleCodes.Admin)
            .Select(u => u.Id).ToListAsync(ct);
        foreach (var id in adminIds) NotifyUser(id, title, message, type, entityName, entityId);
    }

    public void NotifyUser(int userId, string title, string message, string type, string? entityName = null, int? entityId = null)
    {
        _db.Notifications.Add(new Notification
        {
            UserId = userId,
            Title = title,
            Message = message,
            Type = type,
            EntityName = entityName,
            EntityId = entityId,
            CreatedAt = DateTime.UtcNow,
        });
    }
}
