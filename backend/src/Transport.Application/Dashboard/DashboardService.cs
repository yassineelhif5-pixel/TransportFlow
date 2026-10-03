using Microsoft.EntityFrameworkCore;
using Transport.Application.Clients;
using Transport.Application.Common;
using Transport.Application.Interfaces;
using Transport.Application.Missions;
using Transport.Domain.Enums;

namespace Transport.Application.Dashboard;

public record KpiDto(int Total, int Today, int ToAssign, int InProgress, int Completed, int Anomalies, int Cancelled,
    int CompletedThisWeek, double CompletionRate);
public record RankingDto(int Id, string Name, int Count);
public record TrendPointDto(DateTime Date, int Planned, int Completed);
public record ActivityDto(long Id, DateTime At, string Action, string? Description, string? UserName, string EntityName, string? EntityId);

public record DashboardDto(KpiDto Kpis, IReadOnlyList<StatusCountDto> ByStatus, IReadOnlyList<RankingDto> ByDriver,
    IReadOnlyList<RankingDto> ByClient, IReadOnlyList<TrendPointDto> Trend, IReadOnlyList<MissionListItemDto> ActionRequired,
    IReadOnlyList<ActivityDto> RecentActivity, DateTime GeneratedAt);

public interface IDashboardService
{
    Task<DashboardDto> GetAsync(CancellationToken ct);
    Task<KpiDto> GetKpisAsync(CancellationToken ct);
    Task<IReadOnlyList<StatusCountDto>> GetByStatusAsync(CancellationToken ct);
    Task<IReadOnlyList<RankingDto>> GetByDriverAsync(int top, CancellationToken ct);
    Task<IReadOnlyList<RankingDto>> GetByClientAsync(int top, CancellationToken ct);
    Task<IReadOnlyList<ActivityDto>> GetRecentActivityAsync(int take, CancellationToken ct);
}

/// <summary>Toutes les statistiques sont calculées par SQL Server (agrégations EF Core), jamais côté navigateur.</summary>
public class DashboardService : IDashboardService
{
    private readonly IApplicationDbContext _db;
    private readonly IMissionService _missions;

    public DashboardService(IApplicationDbContext db, IMissionService missions)
    {
        _db = db; _missions = missions;
    }

    public async Task<DashboardDto> GetAsync(CancellationToken ct)
    {
        var kpis = await GetKpisAsync(ct);
        var byStatus = await GetByStatusAsync(ct);
        var byDriver = await GetByDriverAsync(5, ct);
        var byClient = await GetByClientAsync(5, ct);
        var trend = await GetTrendAsync(14, ct);
        var action = await _missions.ListAsync(new MissionQuery
        {
            Status = string.Join(',', MissionStatusCodes.Created, MissionStatusCodes.Anomaly, MissionStatusCodes.ToBePickedUp),
            PageSize = 8, SortDir = "asc",
        }, ct);
        var activity = await GetRecentActivityAsync(10, ct);
        return new DashboardDto(kpis, byStatus, byDriver, byClient, trend, action.Items, activity, DateTime.UtcNow);
    }

    public async Task<KpiDto> GetKpisAsync(CancellationToken ct)
    {
        var today = DateTime.UtcNow.Date;
        var weekAgo = today.AddDays(-7);
        var counts = await _db.Missions.AsNoTracking().Where(m => !m.IsDeleted)
            .GroupBy(m => m.CurrentStatus.Code).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        int C(string code) => counts.GetValueOrDefault(code);

        var total = counts.Values.Sum();
        var todayCount = await _db.Missions.CountAsync(m => !m.IsDeleted && m.PlannedDate >= today && m.PlannedDate < today.AddDays(1), ct);
        var completedWeek = await _db.MissionStatusHistories.CountAsync(h => h.ToStatus.Code == MissionStatusCodes.Completed && h.ChangedAt >= weekAgo, ct);
        var closed = C(MissionStatusCodes.Completed) + C(MissionStatusCodes.Cancelled);
        var rate = closed == 0 ? 0 : Math.Round(C(MissionStatusCodes.Completed) * 100.0 / closed, 1);

        return new KpiDto(total, todayCount, C(MissionStatusCodes.Created),
            MissionStatusCodes.Active.Sum(C), C(MissionStatusCodes.Completed), C(MissionStatusCodes.Anomaly),
            C(MissionStatusCodes.Cancelled), completedWeek, rate);
    }

    public async Task<IReadOnlyList<StatusCountDto>> GetByStatusAsync(CancellationToken ct)
    {
        var counts = await _db.Missions.AsNoTracking().Where(m => !m.IsDeleted)
            .GroupBy(m => m.CurrentStatusId).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        var statuses = await _db.MissionStatuses.AsNoTracking().OrderBy(s => s.SortOrder).ToListAsync(ct);
        return statuses.Select(s => new StatusCountDto(s.Code, s.Label, counts.GetValueOrDefault(s.Id))).ToList();
    }

    public async Task<IReadOnlyList<RankingDto>> GetByDriverAsync(int top, CancellationToken ct) =>
        await _db.Missions.AsNoTracking().Where(m => !m.IsDeleted && m.CurrentDriverId != null)
            .GroupBy(m => new { Id = m.CurrentDriverId!.Value, m.CurrentDriver!.FirstName, m.CurrentDriver.LastName })
            .Select(g => new RankingDto(g.Key.Id, g.Key.FirstName + " " + g.Key.LastName, g.Count()))
            .OrderByDescending(r => r.Count).Take(top).ToListAsync(ct);

    public async Task<IReadOnlyList<RankingDto>> GetByClientAsync(int top, CancellationToken ct) =>
        await _db.Missions.AsNoTracking().Where(m => !m.IsDeleted)
            .GroupBy(m => new { m.ClientId, m.Client.Name })
            .Select(g => new RankingDto(g.Key.ClientId, g.Key.Name, g.Count()))
            .OrderByDescending(r => r.Count).Take(top).ToListAsync(ct);

    private async Task<IReadOnlyList<TrendPointDto>> GetTrendAsync(int days, CancellationToken ct)
    {
        var start = DateTime.UtcNow.Date.AddDays(-(days - 1));
        var end = DateTime.UtcNow.Date.AddDays(1);
        var planned = await _db.Missions.AsNoTracking().Where(m => !m.IsDeleted && m.PlannedDate >= start && m.PlannedDate < end)
            .GroupBy(m => m.PlannedDate.Date).Select(g => new { g.Key, Count = g.Count() }).ToListAsync(ct);
        var completed = await _db.MissionStatusHistories.AsNoTracking()
            .Where(h => h.ToStatus.Code == MissionStatusCodes.Completed && h.ChangedAt >= start && h.ChangedAt < end)
            .GroupBy(h => h.ChangedAt.Date).Select(g => new { g.Key, Count = g.Count() }).ToListAsync(ct);
        return Enumerable.Range(0, days).Select(i => start.AddDays(i)).Select(d => new TrendPointDto(d,
            planned.FirstOrDefault(p => p.Key == d)?.Count ?? 0,
            completed.FirstOrDefault(c => c.Key == d)?.Count ?? 0)).ToList();
    }

    public async Task<IReadOnlyList<ActivityDto>> GetRecentActivityAsync(int take, CancellationToken ct) =>
        await _db.AuditLogs.AsNoTracking()
            .Where(a => a.Action != AuditActions.Login && a.Action != AuditActions.LoginFailed && a.Action != AuditActions.Logout && a.Action != AuditActions.DocumentDownload && a.Action != AuditActions.Export)
            .OrderByDescending(a => a.CreatedAt).Take(take)
            .Select(a => new ActivityDto(a.Id, a.CreatedAt, a.Action, a.Description, a.User != null ? a.User.FirstName + " " + a.User.LastName : null, a.EntityName, a.EntityId))
            .ToListAsync(ct);
}
