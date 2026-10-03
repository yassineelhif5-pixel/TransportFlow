using Microsoft.Extensions.Diagnostics.HealthChecks;
using Transport.Application.Interfaces;
using Transport.Infrastructure.Data;

namespace Transport.Api.Infrastructure;

public class SqlServerHealthCheck : IHealthCheck
{
    private readonly ApplicationDbContext _db;
    public SqlServerHealthCheck(ApplicationDbContext db) => _db = db;

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken ct = default)
    {
        try
        {
            return await _db.Database.CanConnectAsync(ct)
                ? HealthCheckResult.Healthy("SQL Server joignable.")
                : HealthCheckResult.Unhealthy("SQL Server injoignable.");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("SQL Server injoignable.", ex);
        }
    }
}

public class StorageHealthCheck : IHealthCheck
{
    private readonly IFileStorageService _storage;
    public StorageHealthCheck(IFileStorageService storage) => _storage = storage;

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken ct = default) =>
        await _storage.IsHealthyAsync(ct)
            ? HealthCheckResult.Healthy("Stockage documentaire accessible en écriture.")
            : HealthCheckResult.Unhealthy("Stockage documentaire inaccessible.");
}
