using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Transport.Application.Interfaces;
using Transport.Domain.Entities;

namespace Transport.Infrastructure.Data;

/// <summary>Seul point d'accès à SQL Server. Toutes les relations sont configurées en Fluent API
/// (voir Data/Configurations) sans suppression en cascade sur les données métier.</summary>
public class ApplicationDbContext : DbContext, IApplicationDbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options) { }

    public DbSet<Role> Roles => Set<Role>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Driver> Drivers => Set<Driver>();
    public DbSet<Vehicle> Vehicles => Set<Vehicle>();
    public DbSet<Client> Clients => Set<Client>();
    public DbSet<Reference> References => Set<Reference>();
    public DbSet<Location> Locations => Set<Location>();
    public DbSet<Mission> Missions => Set<Mission>();
    public DbSet<MissionStatus> MissionStatuses => Set<MissionStatus>();
    public DbSet<MissionStatusHistory> MissionStatusHistories => Set<MissionStatusHistory>();
    public DbSet<MissionAssignment> MissionAssignments => Set<MissionAssignment>();
    public DbSet<DocumentType> DocumentTypes => Set<DocumentType>();
    public DbSet<Document> Documents => Set<Document>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<SystemParameter> SystemParameters => Set<SystemParameter>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ApplicationDbContext).Assembly);

        // Aucune cascade : un historique ou une donnée métier ne doit jamais disparaître par effet de bord.
        foreach (var fk in modelBuilder.Model.GetEntityTypes().SelectMany(e => e.GetForeignKeys()))
            fk.DeleteBehavior = DeleteBehavior.Restrict;
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<decimal>().HavePrecision(12, 2);
        configurationBuilder.Properties<DateTime>().HaveColumnType("datetime2");
    }

    public async Task<ITransactionScope> BeginTransactionAsync(CancellationToken ct = default)
    {
        // Transaction imbriquée : on réutilise la transaction englobante (pas de nouvelle transaction).
        if (Database.CurrentTransaction is not null || !Database.IsRelational())
            return new NoopTransaction();
        return new EfTransaction(await Database.BeginTransactionAsync(ct));
    }

    private sealed class EfTransaction : ITransactionScope
    {
        private readonly IDbContextTransaction _tx;
        public EfTransaction(IDbContextTransaction tx) => _tx = tx;
        public Task CommitAsync(CancellationToken ct = default) => _tx.CommitAsync(ct);
        public ValueTask DisposeAsync() => _tx.DisposeAsync();
    }

    private sealed class NoopTransaction : ITransactionScope
    {
        public Task CommitAsync(CancellationToken ct = default) => Task.CompletedTask;
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}
