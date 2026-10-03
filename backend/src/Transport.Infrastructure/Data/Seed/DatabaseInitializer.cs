using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Transport.Application.Interfaces;
using Transport.Domain.Entities;
using Transport.Domain.Enums;

namespace Transport.Infrastructure.Data.Seed;

/// <summary>Initialisation au démarrage : SQL Server joignable → migrations → données de référence → compte admin
/// → (Development uniquement) jeu de démonstration.</summary>
public class DatabaseInitializer
{
    private readonly ApplicationDbContext _db;
    private readonly IPasswordHasherService _hasher;
    private readonly IConfiguration _config;
    private readonly IHostEnvironment _env;
    private readonly ILogger<DatabaseInitializer> _logger;

    public DatabaseInitializer(ApplicationDbContext db, IPasswordHasherService hasher, IConfiguration config, IHostEnvironment env, ILogger<DatabaseInitializer> logger)
    {
        _db = db; _hasher = hasher; _config = config; _env = env; _logger = logger;
    }

    public async Task InitializeAsync(CancellationToken ct = default)
    {
        await ApplySchemaAsync(ct);
        await SeedReferenceDataAsync(ct);
        await SeedAdminAsync(ct);
        if (_env.IsDevelopment() && _config.GetValue("Seed:DemoData", true))
            await DemoDataSeeder.SeedAsync(_db, _hasher, _logger, ct);
    }

    private async Task ApplySchemaAsync(CancellationToken ct)
    {
        if (!_db.Database.IsRelational())
        {
            await _db.Database.EnsureCreatedAsync(ct);
            return;
        }

        // SQL Server peut mettre quelques secondes à démarrer (Docker) : on réessaie.
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                if (_db.Database.GetMigrations().Any())
                {
                    _logger.LogInformation("Application des migrations EF Core…");
                    await _db.Database.MigrateAsync(ct);
                }
                else
                {
                    _logger.LogWarning("Aucune migration trouvée : création du schéma via EnsureCreated. " +
                                       "Générez la migration initiale (voir README) pour un déploiement versionné.");
                    await _db.Database.EnsureCreatedAsync(ct);
                }
                return;
            }
            catch (Exception ex) when (attempt < 12 && ex is not OperationCanceledException)
            {
                _logger.LogWarning("SQL Server indisponible (tentative {Attempt}/12) : {Message}", attempt, ex.Message);
                await Task.Delay(TimeSpan.FromSeconds(5), ct);
            }
        }
    }

    private async Task SeedReferenceDataAsync(CancellationToken ct)
    {
        var roles = new[] { (RoleCodes.Admin, "Administrateur"), (RoleCodes.Driver, "Chauffeur") };
        foreach (var (code, name) in roles)
            if (!await _db.Roles.AnyAsync(r => r.Code == code, ct))
                _db.Roles.Add(new Role { Code = code, Name = name });

        var statuses = new (string Code, string Label, bool Final)[]
        {
            (MissionStatusCodes.Created, "Créée", false),
            (MissionStatusCodes.Assigned, "Affectée", false),
            (MissionStatusCodes.ToBePickedUp, "À prendre en charge", false),
            (MissionStatusCodes.PickedUp, "Prise en charge", false),
            (MissionStatusCodes.InProgress, "En cours", false),
            (MissionStatusCodes.Completed, "Terminée", true),
            (MissionStatusCodes.Cancelled, "Annulée", true),
            (MissionStatusCodes.Anomaly, "Anomalie", false),
        };
        for (var i = 0; i < statuses.Length; i++)
        {
            var s = statuses[i];
            if (!await _db.MissionStatuses.AnyAsync(x => x.Code == s.Code, ct))
                _db.MissionStatuses.Add(new MissionStatus { Code = s.Code, Label = s.Label, SortOrder = (i + 1) * 10, IsFinal = s.Final });
        }

        var docTypes = new[]
        {
            (DocumentTypeCodes.TransportOrder, "Bon de transport"),
            (DocumentTypeCodes.Cmr, "CMR / lettre de voiture"),
            (DocumentTypeCodes.PickupPhoto, "Photo prise en charge"),
            (DocumentTypeCodes.DeliveryPhoto, "Photo livraison"),
            (DocumentTypeCodes.DeliveryProof, "Preuve de livraison"),
            (DocumentTypeCodes.AnomalyReport, "Constat d'anomalie"),
            (DocumentTypeCodes.Other, "Autre document"),
        };
        foreach (var (code, label) in docTypes)
            if (!await _db.DocumentTypes.AnyAsync(t => t.Code == code, ct))
                _db.DocumentTypes.Add(new DocumentType { Code = code, Label = label });

        var parameters = new[]
        {
            ("COMPANY_NAME", "TransportFlow", "Nom de l'entreprise affiché dans l'application"),
            ("REFERENCE_PREFIX", "REF", "Préfixe suggéré pour les nouvelles références"),
            ("LICENSE_EXPIRY_ALERT_DAYS", "30", "Alerte d'expiration du permis (jours)"),
            ("DEFAULT_COUNTRY", "France", "Pays par défaut des adresses"),
            ("SUPPORT_EMAIL", "support@transportflow.local", "Contact support affiché aux utilisateurs"),
        };
        foreach (var (key, value, desc) in parameters)
            if (!await _db.SystemParameters.AnyAsync(p => p.Key == key, ct))
                _db.SystemParameters.Add(new SystemParameter { Key = key, Value = value, Description = desc });

        await _db.SaveChangesAsync(ct);
    }

    private async Task SeedAdminAsync(CancellationToken ct)
    {
        if (await _db.Users.AnyAsync(u => u.Role.Code == RoleCodes.Admin, ct)) return;

        var username = _config["SEED_ADMIN_USERNAME"] ?? _config["Seed:AdminUsername"] ?? "admin";
        var password = _config["SEED_ADMIN_PASSWORD"] ?? _config["Seed:AdminPassword"];
        var email = _config["SEED_ADMIN_EMAIL"] ?? _config["Seed:AdminEmail"] ?? "admin@local.dev";

        if (_env.IsDevelopment())
        {
            password ??= "admin"; // Identifiants de DÉVELOPPEMENT LOCAL uniquement.
        }
        else
        {
            // Production / Test : aucun mot de passe par défaut.
            if (string.IsNullOrWhiteSpace(password) || password.Length < 12 || password.Equals("admin", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException(
                    "Aucun administrateur n'existe. Définissez SEED_ADMIN_PASSWORD (12 caractères minimum, différent de « admin ») pour créer le compte initial.");
        }

        var role = await _db.Roles.FirstAsync(r => r.Code == RoleCodes.Admin, ct);
        _db.Users.Add(new User
        {
            Username = username.Trim().ToLowerInvariant(),
            Email = email.Trim().ToLowerInvariant(),
            PasswordHash = _hasher.Hash(password), // jamais en clair
            FirstName = "Admin",
            LastName = "TRANSPORTFLOW",
            RoleId = role.Id,
            IsActive = true,
            MustChangePassword = !_env.IsDevelopment(),
            CreatedAt = DateTime.UtcNow,
        });
        await _db.SaveChangesAsync(ct);
        _logger.LogWarning("Compte administrateur initial « {Username} » créé ({Env}).", username, _env.EnvironmentName);
    }
}
