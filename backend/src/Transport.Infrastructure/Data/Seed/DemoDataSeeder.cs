using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Transport.Application.Interfaces;
using Transport.Domain.Entities;
using Transport.Domain.Enums;

namespace Transport.Infrastructure.Data.Seed;

/// <summary>Jeu de données de démonstration réaliste (Development uniquement) afin que le tableau de bord,
/// les listes et l'historique ne soient jamais vides au premier lancement. Toutes les données passent par SQL Server.</summary>
internal static class DemoDataSeeder
{
    public const string DemoDriverPassword = "Chauffeur2026!";

    public static async Task SeedAsync(ApplicationDbContext db, IPasswordHasherService hasher, ILogger logger, CancellationToken ct)
    {
        if (await db.Clients.AnyAsync(ct)) return;
        logger.LogInformation("Création du jeu de démonstration…");

        var rnd = new Random(2026);
        var now = DateTime.UtcNow;
        var today = now.Date;
        var admin = await db.Users.FirstAsync(u => u.Role.Code == RoleCodes.Admin, ct);
        var driverRole = await db.Roles.FirstAsync(r => r.Code == RoleCodes.Driver, ct);
        var statuses = await db.MissionStatuses.ToDictionaryAsync(s => s.Code, ct);
        var docTypes = await db.DocumentTypes.ToDictionaryAsync(t => t.Code, ct);

        // --------------------------------------------------------- Clients
        var clients = new[]
        {
            new Client { Code = "ABC", Name = "ABC Logistics", Address = "12 rue des Entrepôts", City = "Paris", PostalCode = "75019", Phone = "01 42 00 11 22", Email = "exploitation@abc-logistics.fr" },
            new Client { Code = "NORDIS", Name = "Nordis Distribution", Address = "ZI des Hauts", City = "Lille", PostalCode = "59000", Phone = "03 20 11 45 78", Email = "transport@nordis.fr" },
            new Client { Code = "ALPFROID", Name = "Alpina Froid", Address = "4 avenue du Vercors", City = "Grenoble", PostalCode = "38000", Phone = "04 76 22 13 90", Email = "logistique@alpinafroid.fr" },
            new Client { Code = "PORTSUD", Name = "Port-Sud Négoce", Address = "Quai de la Joliette", City = "Marseille", PostalCode = "13002", Phone = "04 91 55 32 10", Email = "contact@portsud-negoce.fr" },
            new Client { Code = "VERCORS", Name = "Vercors Matériaux", Address = "Route de Lyon", City = "Valence", PostalCode = "26000", Phone = "04 75 41 87 66", Email = "chantiers@vercors-materiaux.fr" },
            new Client { Code = "LUMEN", Name = "Lumen Pharma", Address = "8 allée Pasteur", City = "Lyon", PostalCode = "69007", Phone = "04 72 10 20 30", Email = "supply@lumen-pharma.fr" },
            new Client { Code = "BASTIDE", Name = "Atelier Bastide", Address = "21 cours Victor Hugo", City = "Bordeaux", PostalCode = "33000", Phone = "05 56 44 12 08", Email = "atelier@bastide.fr", IsActive = false },
        };
        foreach (var c in clients) { c.Country = "France"; c.CreatedBy = admin.Id; c.CreatedAt = now.AddDays(-60); }
        db.Clients.AddRange(clients);

        // --------------------------------------------------------- Véhicules
        var vehicles = new[]
        {
            new Vehicle { PlateNumber = "AB-123-CD", Brand = "Renault Trucks", Model = "T 480", Type = "Semi-remorque", CapacityKg = 25000, CapacityM3 = 90 },
            new Vehicle { PlateNumber = "EF-456-GH", Brand = "Volvo", Model = "FH 500", Type = "Semi-remorque", CapacityKg = 24000, CapacityM3 = 88 },
            new Vehicle { PlateNumber = "GH-789-JK", Brand = "Mercedes-Benz", Model = "Actros 1845", Type = "Porteur frigorifique", CapacityKg = 12000, CapacityM3 = 45 },
            new Vehicle { PlateNumber = "JK-321-LM", Brand = "Iveco", Model = "Daily 35S", Type = "Fourgon", CapacityKg = 1200, CapacityM3 = 16 },
            new Vehicle { PlateNumber = "LM-654-NP", Brand = "Renault", Model = "Master", Type = "Fourgon", CapacityKg = 1000, CapacityM3 = 13, Status = VehicleStatuses.Maintenance },
            new Vehicle { PlateNumber = "NP-987-QR", Brand = "DAF", Model = "XF 480", Type = "Plateau", CapacityKg = 22000, CapacityM3 = 70 },
        };
        foreach (var v in vehicles) { v.CreatedBy = admin.Id; v.CreatedAt = now.AddDays(-90); }
        db.Vehicles.AddRange(vehicles);
        await db.SaveChangesAsync(ct);

        // --------------------------------------------------------- Chauffeurs (avec compte mobile)
        var driverSeeds = new (string First, string Last, string Phone, string License, int ExpiryDays, int Vehicle, bool Active)[]
        {
            ("Mohamed", "BEN ALI", "06 12 34 56 78", "13AB45678", 900, 0, true),
            ("Julie", "MARCHAND", "06 23 45 67 89", "15CD98765", 1200, 1, true),
            ("Karim", "HADDAD", "06 34 56 78 90", "11EF24680", 18, 2, true),
            ("Thomas", "LEROY", "06 45 67 89 01", "18GH13579", 700, 3, true),
            ("Sofia", "MORENO", "06 56 78 90 12", "20IJ11223", 1500, 5, true),
            ("Nicolas", "PETIT", "06 67 89 01 23", "09KL44556", 400, -1, false),
        };
        var drivers = new List<Driver>();
        foreach (var d in driverSeeds)
        {
            var login = $"{d.First}.{d.Last.Replace(" ", "")}".ToLowerInvariant();
            var user = new User
            {
                Username = login, Email = $"{login}@transportflow.local", PasswordHash = hasher.Hash(DemoDriverPassword),
                FirstName = d.First, LastName = d.Last, Phone = d.Phone, RoleId = driverRole.Id, IsActive = d.Active,
                CreatedAt = now.AddDays(-80), CreatedBy = admin.Id, LastLoginAt = d.Active ? now.AddHours(-rnd.Next(1, 30)) : null,
            };
            drivers.Add(new Driver
            {
                User = user, FirstName = d.First, LastName = d.Last, Email = user.Email, Phone = d.Phone, LicenseNumber = d.License,
                LicenseExpiryDate = today.AddDays(d.ExpiryDays), DefaultVehicleId = d.Vehicle >= 0 ? vehicles[d.Vehicle].Id : null,
                IsActive = d.Active, CreatedAt = now.AddDays(-80), CreatedBy = admin.Id,
            });
        }
        db.Drivers.AddRange(drivers);
        await db.SaveChangesAsync(ct);
        var activeDrivers = drivers.Where(d => d.IsActive).ToList();

        // --------------------------------------------------------- Missions
        var routes = new (string From, string FromCp, string FromAddr, string To, string ToCp, string ToAddr)[]
        {
            ("Paris", "75019", "12 rue des Entrepôts", "Lyon", "69007", "8 allée Pasteur"),
            ("Lille", "59000", "ZI des Hauts", "Rungis", "94150", "MIN de Rungis, bât. C4"),
            ("Marseille", "13002", "Quai de la Joliette", "Toulouse", "31200", "Parc logistique Eurocentre"),
            ("Grenoble", "38000", "4 avenue du Vercors", "Annecy", "74000", "12 rue de la Paix"),
            ("Le Havre", "76600", "Terminal de France", "Rouen", "76000", "Port de Rouen, quai 4"),
            ("Lyon", "69007", "8 allée Pasteur", "Strasbourg", "67000", "Port du Rhin"),
            ("Nantes", "44000", "Zone de Cheviré", "Bordeaux", "33000", "21 cours Victor Hugo"),
            ("Valence", "26000", "Route de Lyon", "Montpellier", "34000", "ZAC Garosud"),
        };
        var goods = new[] { ("Palettes produits secs", 18000m, 60m), ("Produits frais sous température dirigée", 9000m, 38m), ("Matériaux de construction", 21000m, 55m),
            ("Médicaments (classe 2-8 °C)", 2400m, 12m), ("Mobilier d'atelier", 4200m, 30m), ("Pièces détachées automobiles", 6800m, 24m), ("Colis messagerie", 900m, 11m) };

        var plans = new List<(string Ref, int Day, string Target, int Route, int Client, int Driver)>();
        var n = 101;
        for (var day = -9; day <= 6; day++)
        {
            var count = day == 0 ? 5 : rnd.Next(1, 4);
            for (var k = 0; k < count; k++)
            {
                var number = $"REF-2026-{n:00000}";
                string target;
                if (n == 125) { plans.Add((number, 0, MissionStatusCodes.PickedUp, 0, 0, 0)); n++; continue; }
                if (day < -1) target = rnd.NextDouble() switch { < 0.08 => MissionStatusCodes.Cancelled, < 0.14 => MissionStatusCodes.Anomaly, _ => MissionStatusCodes.Completed };
                else if (day == -1) target = rnd.NextDouble() < 0.7 ? MissionStatusCodes.Completed : MissionStatusCodes.InProgress;
                else if (day == 0) target = new[] { MissionStatusCodes.ToBePickedUp, MissionStatusCodes.InProgress, MissionStatusCodes.PickedUp, MissionStatusCodes.Anomaly, MissionStatusCodes.Created }[k % 5];
                else if (day <= 2) target = rnd.NextDouble() < 0.6 ? MissionStatusCodes.Assigned : MissionStatusCodes.Created;
                else target = rnd.NextDouble() < 0.3 ? MissionStatusCodes.Assigned : MissionStatusCodes.Created;
                plans.Add((number, day, target, rnd.Next(routes.Length), rnd.Next(clients.Length - 1), rnd.Next(activeDrivers.Count)));
                n++;
            }
        }
        if (!plans.Any(p => p.Ref == "REF-2026-00125")) plans.Add(("REF-2026-00125", 0, MissionStatusCodes.PickedUp, 0, 0, 0));

        var path = new[] { MissionStatusCodes.Created, MissionStatusCodes.Assigned, MissionStatusCodes.ToBePickedUp, MissionStatusCodes.PickedUp, MissionStatusCodes.InProgress, MissionStatusCodes.Completed };
        var built = new List<(Mission Mission, List<(DateTime At, string Code, int By, string? Comment)> Steps, Driver? Driver, Vehicle? Vehicle, DateTime? AssignedAt)>();

        foreach (var p in plans)
        {
            var route = routes[p.Route];
            var client = clients[p.Client];
            var driver = activeDrivers[p.Driver];
            var vehicle = vehicles.FirstOrDefault(v => v.Id == driver.DefaultVehicleId && v.Status != VehicleStatuses.Maintenance);
            var g = goods[rnd.Next(goods.Length)];
            var planned = today.AddDays(p.Day).AddHours(6 + rnd.Next(0, 9)).AddMinutes(rnd.Next(0, 4) * 15);
            var created = planned.AddDays(-2).AddHours(-rnd.Next(1, 8));
            if (created > now) created = now.AddHours(-3);

            var codes = p.Target switch
            {
                MissionStatusCodes.Cancelled => new List<string> { MissionStatusCodes.Created, MissionStatusCodes.Assigned, MissionStatusCodes.Cancelled },
                MissionStatusCodes.Anomaly => new List<string> { MissionStatusCodes.Created, MissionStatusCodes.Assigned, MissionStatusCodes.ToBePickedUp, MissionStatusCodes.PickedUp, MissionStatusCodes.InProgress, MissionStatusCodes.Anomaly },
                _ => path.Take(Array.IndexOf(path, p.Target) + 1).ToList(),
            };

            var steps = new List<(DateTime, string, int, string?)>();
            var at = created;
            DateTime? assignedAt = null;
            foreach (var code in codes)
            {
                at = code switch
                {
                    MissionStatusCodes.Created => created,
                    MissionStatusCodes.Assigned => created.AddMinutes(rnd.Next(5, 90)),
                    MissionStatusCodes.ToBePickedUp => planned.AddHours(-2),
                    MissionStatusCodes.PickedUp => planned.AddMinutes(rnd.Next(-10, 25)),
                    MissionStatusCodes.InProgress => at.AddMinutes(rnd.Next(10, 40)),
                    MissionStatusCodes.Completed => at.AddHours(rnd.Next(3, 7)),
                    _ => at.AddMinutes(rnd.Next(30, 120)),
                };
                if (at > now) at = now.AddMinutes(-rnd.Next(2, 30));
                if (code == MissionStatusCodes.Assigned) assignedAt = at;
                var byDriver = code is MissionStatusCodes.PickedUp or MissionStatusCodes.InProgress or MissionStatusCodes.Completed or MissionStatusCodes.Anomaly;
                var comment = code switch
                {
                    MissionStatusCodes.Created => "Création de la mission",
                    MissionStatusCodes.Assigned => $"Affectée à {driver.FullName}",
                    MissionStatusCodes.Anomaly => new[] { "Quai de livraison fermé à l'arrivée", "Palette endommagée constatée au chargement", "Retard important : accident sur l'A7" }[rnd.Next(3)],
                    MissionStatusCodes.Cancelled => "Commande annulée par le client",
                    MissionStatusCodes.Completed => "Livraison effectuée, CMR signée",
                    _ => null,
                };
                steps.Add((at, code, byDriver ? driver.UserId!.Value : admin.Id, comment));
            }

            var final = codes[^1];
            var lastStep = steps[^1];
            var mission = new Mission
            {
                Reference = new Reference { Number = p.Ref, ClientId = client.Id, Source = ReferenceSources.Manual, Status = ReferenceStatuses.Used, CreatedBy = admin.Id, CreatedAt = created },
                ClientId = client.Id,
                PlannedDate = planned,
                PickupLocation = new Location { Address = route.FromAddr, City = route.From, PostalCode = route.FromCp, Country = "France" },
                DeliveryLocation = new Location { Address = route.ToAddr, City = route.To, PostalCode = route.ToCp, Country = "France" },
                Description = $"Transport {route.From} → {route.To} pour {client.Name}.",
                Goods = g.Item1, WeightKg = g.Item2, VolumeM3 = g.Item3,
                CurrentStatusId = statuses[final].Id,
                CurrentDriverId = assignedAt is null ? null : driver.Id,
                CurrentVehicleId = assignedAt is null ? null : vehicle?.Id,
                CreatedBy = admin.Id, CreatedAt = created,
                LastAction = final switch
                {
                    MissionStatusCodes.Created => "Mission créée",
                    MissionStatusCodes.Assigned => $"Affectée à {driver.FullName}",
                    _ => $"Passée à {statuses[final].Label}",
                },
                LastActionAt = lastStep.Item1,
            };
            db.Missions.Add(mission);
            built.Add((mission, steps, assignedAt is null ? null : driver, vehicle, assignedAt));
        }

        // Références disponibles (sans mission), dont certaines importées.
        for (var i = 0; i < 9; i++)
        {
            db.References.Add(new Reference
            {
                Number = $"REF-2026-{n + i:00000}", ClientId = clients[i % (clients.Length - 1)].Id,
                Source = i % 3 == 0 ? ReferenceSources.Import : ReferenceSources.Manual, Status = ReferenceStatuses.Open,
                Notes = i % 3 == 0 ? "Import planning hebdomadaire" : null, CreatedBy = admin.Id, CreatedAt = now.AddHours(-rnd.Next(2, 72)),
            });
        }
        await db.SaveChangesAsync(ct);

        // --------------------------------------------------------- Historique, affectations, audit, notifications
        foreach (var (m, steps, driver, vehicle, assignedAt) in built)
        {
            int? previous = null;
            foreach (var (at, code, by, comment) in steps)
            {
                db.MissionStatusHistories.Add(new MissionStatusHistory { MissionId = m.Id, FromStatusId = previous, ToStatusId = statuses[code].Id, ChangedBy = by, ChangedAt = at, Comment = comment });
                previous = statuses[code].Id;

                var (action, desc) = code switch
                {
                    MissionStatusCodes.Created => (AuditActions.Create, $"Mission {m.Reference.Number} créée pour {clients.First(c => c.Id == m.ClientId).Name}."),
                    MissionStatusCodes.Assigned => (AuditActions.Assign, $"Mission {m.Reference.Number} affectée à {driver!.FullName}{(vehicle is null ? "" : $" ({vehicle.PlateNumber})")}."),
                    _ => (AuditActions.StatusChange, $"Mission {m.Reference.Number} passée à {statuses[code].Label}."),
                };
                db.AuditLogs.Add(new AuditLog { UserId = by, EntityName = "Mission", EntityId = m.Id.ToString(), Action = action, Description = desc, CreatedAt = at, IpAddress = "127.0.0.1", UserAgent = by == admin.Id ? "TransportFlow Web" : "TransportFlow Mobile (démo)" });

                if (code is MissionStatusCodes.Anomaly or MissionStatusCodes.Completed && at > now.AddDays(-2))
                {
                    db.Notifications.Add(new Notification
                    {
                        UserId = admin.Id, EntityName = "Mission", EntityId = m.Id, CreatedAt = at, IsRead = at < now.AddHours(-20),
                        Title = code == MissionStatusCodes.Anomaly ? "Nouvelle anomalie détectée" : "Mission terminée",
                        Message = code == MissionStatusCodes.Anomaly ? $"Anomalie sur la mission {m.Reference.Number} : {comment}" : $"Mission {m.Reference.Number} terminée.",
                        Type = code == MissionStatusCodes.Anomaly ? NotificationTypes.Danger : NotificationTypes.Success,
                    });
                }
                if (code == MissionStatusCodes.PickedUp && at > now.AddHours(-12))
                {
                    db.Notifications.Add(new Notification
                    {
                        UserId = admin.Id, EntityName = "Mission", EntityId = m.Id, CreatedAt = at, Type = NotificationTypes.Info,
                        Title = "Prise en charge", Message = $"Mission {m.Reference.Number} prise en charge par {driver!.FirstName}.",
                    });
                }
            }

            if (driver is not null && assignedAt is not null)
            {
                var finalCode = steps[^1].Code;
                var ended = finalCode is MissionStatusCodes.Completed or MissionStatusCodes.Cancelled;
                db.MissionAssignments.Add(new MissionAssignment
                {
                    MissionId = m.Id, DriverId = driver.Id, VehicleId = vehicle?.Id, AssignedBy = admin.Id, AssignedAt = assignedAt.Value,
                    Status = ended ? AssignmentStatuses.Ended : AssignmentStatuses.Active, EndedAt = ended ? steps[^1].At : null,
                });
                if (vehicle is not null && finalCode is MissionStatusCodes.PickedUp or MissionStatusCodes.InProgress)
                    vehicle.Status = VehicleStatuses.InUse;
            }
        }

        db.AuditLogs.Add(new AuditLog { UserId = admin.Id, EntityName = "Reference", Action = AuditActions.Import, Description = "Import « planning-semaine.xlsx » : 3 référence(s) importée(s), 0 ligne(s) ignorée(s).", CreatedAt = now.AddHours(-26), IpAddress = "127.0.0.1", UserAgent = "TransportFlow Web" });
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Jeu de démonstration créé : {Missions} missions, {Drivers} chauffeurs.", built.Count, drivers.Count);
    }
}
