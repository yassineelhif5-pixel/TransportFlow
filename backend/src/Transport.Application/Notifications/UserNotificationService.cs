using Microsoft.EntityFrameworkCore;
using Transport.Application.Common;
using Transport.Application.Interfaces;

namespace Transport.Application.Notifications;

public record NotificationDto(int Id, string Title, string Message, string Type, string? EntityName, int? EntityId, bool IsRead, DateTime CreatedAt);

public class NotificationQuery : PagedQuery
{
    public bool? UnreadOnly { get; set; }
}

public interface IUserNotificationService
{
    Task<PagedResult<NotificationDto>> ListAsync(NotificationQuery q, CancellationToken ct);
    Task<int> UnreadCountAsync(CancellationToken ct);
    Task MarkReadAsync(int id, CancellationToken ct);
    Task<int> MarkAllReadAsync(CancellationToken ct);
}

/// <summary>Notifications de l'utilisateur connecté uniquement.</summary>
public class UserNotificationService : IUserNotificationService
{
    private readonly IApplicationDbContext _db;
    private readonly ICurrentUserService _current;

    public UserNotificationService(IApplicationDbContext db, ICurrentUserService current)
    {
        _db = db; _current = current;
    }

    public async Task<PagedResult<NotificationDto>> ListAsync(NotificationQuery q, CancellationToken ct)
    {
        var userId = _current.RequireUserId();
        var query = _db.Notifications.AsNoTracking().Where(n => n.UserId == userId);
        if (q.UnreadOnly == true) query = query.Where(n => !n.IsRead);
        return await query.OrderByDescending(n => n.CreatedAt)
            .Select(n => new NotificationDto(n.Id, n.Title, n.Message, n.Type, n.EntityName, n.EntityId, n.IsRead, n.CreatedAt))
            .ToPagedAsync(q, ct);
    }

    public Task<int> UnreadCountAsync(CancellationToken ct)
    {
        var userId = _current.RequireUserId();
        return _db.Notifications.CountAsync(n => n.UserId == userId && !n.IsRead, ct);
    }

    public async Task MarkReadAsync(int id, CancellationToken ct)
    {
        var userId = _current.RequireUserId();
        var n = await _db.Notifications.FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId, ct)
            ?? throw new NotFoundException("NOTIFICATION_NOT_FOUND", "La notification n'existe pas.");
        if (n.IsRead) return;
        n.IsRead = true;
        n.ReadAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
    }

    public async Task<int> MarkAllReadAsync(CancellationToken ct)
    {
        var userId = _current.RequireUserId();
        var unread = await _db.Notifications.Where(n => n.UserId == userId && !n.IsRead).ToListAsync(ct);
        foreach (var n in unread) { n.IsRead = true; n.ReadAt = DateTime.UtcNow; }
        await _db.SaveChangesAsync(ct);
        return unread.Count;
    }
}
