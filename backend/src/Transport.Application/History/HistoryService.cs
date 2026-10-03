using Microsoft.EntityFrameworkCore;
using Transport.Application.Common;
using Transport.Application.Interfaces;

namespace Transport.Application.History;

public record HistoryItemDto(long Id, DateTime CreatedAt, int? UserId, string? UserName, string EntityName, string? EntityId,
    string Action, string? Description, string? OldValue, string? NewValue, string? IpAddress);

public record HistoryFiltersDto(IReadOnlyList<UserOptionDto> Users, IReadOnlyList<string> Actions, IReadOnlyList<string> Entities);
public record UserOptionDto(int Id, string Name);

public class HistoryQuery : PagedQuery
{
    public int? UserId { get; set; }
    public string? Action { get; set; }
    public string? EntityName { get; set; }
    public string? EntityId { get; set; }
    public string? Reference { get; set; }
    public DateTime? DateFrom { get; set; }
    public DateTime? DateTo { get; set; }
}

public interface IHistoryService
{
    IQueryable<HistoryItemDto> Query(HistoryQuery q);
    Task<PagedResult<HistoryItemDto>> ListAsync(HistoryQuery q, CancellationToken ct);
    Task<HistoryFiltersDto> GetFiltersAsync(CancellationToken ct);
}

/// <summary>Lecture du journal d'audit métier (AuditLog). Lecture seule : l'historique n'est jamais supprimé.</summary>
public class HistoryService : IHistoryService
{
    private readonly IApplicationDbContext _db;
    public HistoryService(IApplicationDbContext db) => _db = db;

    public IQueryable<HistoryItemDto> Query(HistoryQuery q)
    {
        var query = _db.AuditLogs.AsNoTracking().AsQueryable();
        if (q.UserId is { } u) query = query.Where(a => a.UserId == u);
        if (!string.IsNullOrWhiteSpace(q.Action)) query = query.Where(a => a.Action == q.Action);
        if (!string.IsNullOrWhiteSpace(q.EntityName)) query = query.Where(a => a.EntityName == q.EntityName);
        if (!string.IsNullOrWhiteSpace(q.EntityId)) query = query.Where(a => a.EntityId == q.EntityId);
        if (!string.IsNullOrWhiteSpace(q.Reference))
        {
            var r = q.Reference.Trim();
            query = query.Where(a => (a.Description != null && a.Description.Contains(r)) || (a.NewValue != null && a.NewValue.Contains(r)));
        }
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(a => (a.Description != null && a.Description.Contains(s)) || a.EntityName.Contains(s) || a.Action.Contains(s));
        }
        if (q.DateFrom is { } from) query = query.Where(a => a.CreatedAt >= from.Date);
        if (q.DateTo is { } to) query = query.Where(a => a.CreatedAt < to.Date.AddDays(1));

        query = q.SortBy?.ToLowerInvariant() switch
        {
            "action" => query.OrderByDir(a => a.Action, q.Descending),
            "entity" => query.OrderByDir(a => a.EntityName, q.Descending),
            _ => query.OrderByDir(a => a.CreatedAt, q.DescendingOrDefault),
        };

        return query.Select(a => new HistoryItemDto(a.Id, a.CreatedAt, a.UserId,
            a.User != null ? a.User.FirstName + " " + a.User.LastName : null,
            a.EntityName, a.EntityId, a.Action, a.Description, a.OldValue, a.NewValue, a.IpAddress));
    }

    public Task<PagedResult<HistoryItemDto>> ListAsync(HistoryQuery q, CancellationToken ct) => Query(q).ToPagedAsync(q, ct);

    public async Task<HistoryFiltersDto> GetFiltersAsync(CancellationToken ct)
    {
        var users = await _db.Users.AsNoTracking().Where(u => !u.IsDeleted).OrderBy(u => u.LastName)
            .Select(u => new UserOptionDto(u.Id, u.FirstName + " " + u.LastName)).ToListAsync(ct);
        var actions = await _db.AuditLogs.AsNoTracking().Select(a => a.Action).Distinct().OrderBy(a => a).ToListAsync(ct);
        var entities = await _db.AuditLogs.AsNoTracking().Select(a => a.EntityName).Distinct().OrderBy(a => a).ToListAsync(ct);
        return new HistoryFiltersDto(users, actions, entities);
    }
}
