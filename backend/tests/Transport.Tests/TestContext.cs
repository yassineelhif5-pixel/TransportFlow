using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting.Internal;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Transport.Application.Auth;
using Transport.Application.Documents;
using Transport.Application.Interfaces;
using Transport.Application.Missions;
using Transport.Application.References;
using Transport.Application.Services;
using Transport.Domain.Entities;
using Transport.Domain.Enums;
using Transport.Infrastructure.Data;
using Transport.Infrastructure.Data.Seed;
using Transport.Infrastructure.Security;
using Transport.Infrastructure.Spreadsheets;
using Transport.Infrastructure.Storage;

namespace Transport.Tests;

public class FakeCurrentUser : ICurrentUserService
{
    public int? UserId { get; set; }
    public string? Username { get; set; } = "admin";
    public string? Role { get; set; } = RoleCodes.Admin;
    public bool IsAdmin => Role == RoleCodes.Admin;
    public string? IpAddress { get; set; } = "127.0.0.1";
    public string? UserAgent { get; set; } = "tests";
    public int RequireUserId() => UserId ?? throw new InvalidOperationException("Pas d'utilisateur.");
}

/// <summary>Contexte de test : base EF Core InMemory isolée + services applicatifs réels.</summary>
public sealed class TestContext : IAsyncDisposable
{
    public ApplicationDbContext Db { get; }
    public FakeCurrentUser User { get; } = new();
    public PasswordHasherService Hasher { get; } = new();
    public string StorageRoot { get; } = Path.Combine(Path.GetTempPath(), "tf-tests-" + Guid.NewGuid().ToString("N"));
    public LocalFileStorageService Storage { get; }
    public TokenService Tokens { get; } = new(Options.Create(new JwtOptions { Secret = "tests-secret-0123456789-abcdefghijklmnop" }));

    private TestContext(ApplicationDbContext db)
    {
        Db = db;
        Storage = new LocalFileStorageService(Options.Create(new StorageOptions { RootPath = StorageRoot }), NullLogger<LocalFileStorageService>.Instance);
    }

    public static async Task<TestContext> CreateAsync()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase("tf-" + Guid.NewGuid().ToString("N"))
            .Options;
        var ctx = new TestContext(new ApplicationDbContext(options));
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Seed:DemoData"] = "false" }).Build();
        var env = new HostingEnvironment { EnvironmentName = "Development" };
        await new DatabaseInitializer(ctx.Db, ctx.Hasher, config, env, NullLogger<DatabaseInitializer>.Instance).InitializeAsync();
        ctx.User.UserId = (await ctx.Db.Users.FirstAsync(u => u.Username == "admin")).Id;
        return ctx;
    }

    public AuditService Audit => new(Db, User);
    public NotificationService Notifications => new(Db);

    public MissionService Missions() => new(Db, User, Audit, Notifications,
        new MissionUpsertRequestValidator(), new AssignMissionRequestValidator(), new ChangeStatusRequestValidator());

    public AuthService Auth() => new(Db, Hasher, Tokens, User, Audit, new LoginRequestValidator(), new ChangePasswordRequestValidator());

    public ReferenceService References() => new(Db, User, Audit, Notifications, new SpreadsheetService(), new ReferenceUpsertRequestValidator());

    public DocumentService Documents() => new(Db, User, Audit, Storage, new DocumentPolicy());

    public async Task<Client> AddClientAsync(string code = "ABC", string name = "ABC Logistics", bool active = true)
    {
        var c = new Client { Code = code, Name = name, Country = "France", IsActive = active };
        Db.Clients.Add(c);
        await Db.SaveChangesAsync();
        return c;
    }

    public async Task<Driver> AddDriverAsync(bool active = true, bool withUser = true, int licenseDays = 365, string license = "LIC001")
    {
        var role = await Db.Roles.FirstAsync(r => r.Code == RoleCodes.Driver);
        var d = new Driver
        {
            FirstName = "Mohamed", LastName = "BEN ALI", Phone = "0612345678", LicenseNumber = license,
            LicenseExpiryDate = DateTime.UtcNow.Date.AddDays(licenseDays), IsActive = active,
        };
        if (withUser)
            d.User = new User { Username = "drv-" + license.ToLowerInvariant(), Email = license.ToLowerInvariant() + "@test.local", PasswordHash = Hasher.Hash("Chauffeur2026!"), FirstName = "Mohamed", LastName = "BEN ALI", RoleId = role.Id, IsActive = active };
        Db.Drivers.Add(d);
        await Db.SaveChangesAsync();
        return d;
    }

    public static MissionUpsertRequest NewMission(int clientId, string reference = "REF-2026-00125", int? driverId = null) => new(
        reference, clientId, DateTime.UtcNow.AddDays(1),
        new LocationInput(null, "12 rue des Entrepôts", "Paris", "75019", "France"),
        new LocationInput(null, "8 allée Pasteur", "Lyon", "69007", "France"),
        "Palettes", "Produits secs", 18000, 60, driverId);

    public async ValueTask DisposeAsync()
    {
        await Db.DisposeAsync();
        try { Directory.Delete(StorageRoot, true); } catch { /* ignore */ }
    }
}

public static class ValidatorFactory
{
    public static IValidator<T> Of<T>(AbstractValidator<T> v) => v;
}
