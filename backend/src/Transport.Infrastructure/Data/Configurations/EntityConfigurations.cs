using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Transport.Domain.Entities;
using Transport.Domain.Enums;

namespace Transport.Infrastructure.Data.Configurations;

internal static class Sql
{
    public static string In(string column, IEnumerable<string> values) =>
        $"[{column}] IN ({string.Join(", ", values.Select(v => $"N'{v}'"))})";
}

public class RoleConfiguration : IEntityTypeConfiguration<Role>
{
    public void Configure(EntityTypeBuilder<Role> b)
    {
        b.ToTable("Role", t => t.HasCheckConstraint("CK_Role_Code", Sql.In("Code", RoleCodes.All)));
        b.Property(x => x.Code).HasMaxLength(20).IsRequired();
        b.Property(x => x.Name).HasMaxLength(100).IsRequired();
        b.HasIndex(x => x.Code).IsUnique();
    }
}

public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> b)
    {
        b.ToTable("User");
        b.Property(x => x.Username).HasMaxLength(100).IsRequired();
        b.Property(x => x.Email).HasMaxLength(256).IsRequired();
        b.Property(x => x.PasswordHash).HasMaxLength(512).IsRequired();
        b.Property(x => x.FirstName).HasMaxLength(100).IsRequired();
        b.Property(x => x.LastName).HasMaxLength(100).IsRequired();
        b.Property(x => x.Phone).HasMaxLength(30);
        b.Property(x => x.RefreshTokenHash).HasMaxLength(128);
        b.Property(x => x.IsActive).HasDefaultValue(true);
        b.Ignore(x => x.FullName);
        b.HasIndex(x => x.Username).IsUnique();
        b.HasIndex(x => x.Email).IsUnique();
        b.HasIndex(x => x.RefreshTokenHash).HasFilter("[RefreshTokenHash] IS NOT NULL");
        b.HasOne(x => x.Role).WithMany(r => r.Users).HasForeignKey(x => x.RoleId);
    }
}

public class DriverConfiguration : IEntityTypeConfiguration<Driver>
{
    public void Configure(EntityTypeBuilder<Driver> b)
    {
        b.ToTable("Driver");
        b.Property(x => x.FirstName).HasMaxLength(100).IsRequired();
        b.Property(x => x.LastName).HasMaxLength(100).IsRequired();
        b.Property(x => x.Email).HasMaxLength(256);
        b.Property(x => x.Phone).HasMaxLength(30).IsRequired();
        b.Property(x => x.LicenseNumber).HasMaxLength(50).IsRequired();
        b.Property(x => x.LicenseExpiryDate).HasColumnType("date");
        b.Ignore(x => x.FullName);
        b.HasIndex(x => x.LicenseNumber).IsUnique().HasFilter("[IsDeleted] = 0");
        b.HasIndex(x => x.UserId).IsUnique().HasFilter("[UserId] IS NOT NULL");
        b.HasIndex(x => new { x.LastName, x.FirstName });
        b.HasOne(x => x.User).WithOne(u => u.Driver).HasForeignKey<Driver>(x => x.UserId);
        b.HasOne(x => x.DefaultVehicle).WithMany().HasForeignKey(x => x.DefaultVehicleId);
    }
}

public class VehicleConfiguration : IEntityTypeConfiguration<Vehicle>
{
    public void Configure(EntityTypeBuilder<Vehicle> b)
    {
        b.ToTable("Vehicle", t =>
        {
            t.HasCheckConstraint("CK_Vehicle_Status", Sql.In("Status", VehicleStatuses.All));
            t.HasCheckConstraint("CK_Vehicle_Capacity", "[CapacityKg] > 0");
        });
        b.Property(x => x.PlateNumber).HasMaxLength(15).IsRequired();
        b.Property(x => x.Brand).HasMaxLength(80).IsRequired();
        b.Property(x => x.Model).HasMaxLength(80).IsRequired();
        b.Property(x => x.Type).HasMaxLength(60).IsRequired();
        b.Property(x => x.Status).HasMaxLength(20).IsRequired();
        b.Property(x => x.CapacityKg).HasPrecision(10, 2);
        b.Property(x => x.CapacityM3).HasPrecision(8, 2);
        b.HasIndex(x => x.PlateNumber).IsUnique();
        b.HasIndex(x => x.Status);
    }
}

public class ClientConfiguration : IEntityTypeConfiguration<Client>
{
    public void Configure(EntityTypeBuilder<Client> b)
    {
        b.ToTable("Client");
        b.Property(x => x.Code).HasMaxLength(20).IsRequired();
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.Property(x => x.Address).HasMaxLength(250);
        b.Property(x => x.City).HasMaxLength(120);
        b.Property(x => x.PostalCode).HasMaxLength(20);
        b.Property(x => x.Country).HasMaxLength(80).IsRequired();
        b.Property(x => x.Phone).HasMaxLength(30);
        b.Property(x => x.Email).HasMaxLength(256);
        b.HasIndex(x => x.Code).IsUnique();
        b.HasIndex(x => x.Name);
    }
}

public class ReferenceConfiguration : IEntityTypeConfiguration<Reference>
{
    public void Configure(EntityTypeBuilder<Reference> b)
    {
        b.ToTable("Reference", t =>
        {
            t.HasCheckConstraint("CK_Reference_Source", Sql.In("Source", ReferenceSources.All));
            t.HasCheckConstraint("CK_Reference_Status", Sql.In("Status", ReferenceStatuses.All));
        });
        b.Property(x => x.Number).HasMaxLength(50).IsRequired();
        b.Property(x => x.Source).HasMaxLength(20).IsRequired();
        b.Property(x => x.Status).HasMaxLength(20).IsRequired();
        b.Property(x => x.Notes).HasMaxLength(1000);
        // Unicité stricte du numéro de référence (y compris références supprimées : pas de réutilisation ambiguë).
        b.HasIndex(x => x.Number).IsUnique();
        b.HasIndex(x => new { x.ClientId, x.Status });
        b.HasOne(x => x.Client).WithMany(c => c.References).HasForeignKey(x => x.ClientId);
    }
}

public class LocationConfiguration : IEntityTypeConfiguration<Location>
{
    public void Configure(EntityTypeBuilder<Location> b)
    {
        b.ToTable("Location");
        b.Property(x => x.Label).HasMaxLength(150);
        b.Property(x => x.Address).HasMaxLength(250).IsRequired();
        b.Property(x => x.City).HasMaxLength(120).IsRequired();
        b.Property(x => x.PostalCode).HasMaxLength(20);
        b.Property(x => x.Country).HasMaxLength(80).IsRequired();
        b.Property(x => x.Latitude).HasPrecision(9, 6);
        b.Property(x => x.Longitude).HasPrecision(9, 6);
        b.HasIndex(x => x.City);
    }
}

public class MissionStatusConfiguration : IEntityTypeConfiguration<MissionStatus>
{
    public void Configure(EntityTypeBuilder<MissionStatus> b)
    {
        b.ToTable("MissionStatus", t => t.HasCheckConstraint("CK_MissionStatus_Code", Sql.In("Code", MissionStatusCodes.All)));
        b.Property(x => x.Code).HasMaxLength(30).IsRequired();
        b.Property(x => x.Label).HasMaxLength(60).IsRequired();
        b.HasIndex(x => x.Code).IsUnique();
    }
}

public class MissionConfiguration : IEntityTypeConfiguration<Mission>
{
    public void Configure(EntityTypeBuilder<Mission> b)
    {
        b.ToTable("Mission", t =>
        {
            t.HasCheckConstraint("CK_Mission_Weight", "[WeightKg] IS NULL OR [WeightKg] >= 0");
            t.HasCheckConstraint("CK_Mission_Volume", "[VolumeM3] IS NULL OR [VolumeM3] >= 0");
        });
        b.Property(x => x.Description).HasMaxLength(2000);
        b.Property(x => x.Goods).HasMaxLength(250);
        b.Property(x => x.WeightKg).HasPrecision(10, 2);
        b.Property(x => x.VolumeM3).HasPrecision(10, 2);
        b.Property(x => x.LastAction).HasMaxLength(250);
        b.Property(x => x.RowVersion).IsRowVersion();

        // Une seule mission active par référence (les missions supprimées logiquement sont conservées).
        b.HasIndex(x => x.ReferenceId).IsUnique().HasFilter("[IsDeleted] = 0");
        b.HasIndex(x => x.PlannedDate);
        b.HasIndex(x => new { x.CurrentStatusId, x.PlannedDate });
        b.HasIndex(x => x.CurrentDriverId);
        b.HasIndex(x => x.ClientId);

        b.HasOne(x => x.Reference).WithMany(r => r.Missions).HasForeignKey(x => x.ReferenceId);
        b.HasOne(x => x.Client).WithMany(c => c.Missions).HasForeignKey(x => x.ClientId);
        b.HasOne(x => x.PickupLocation).WithMany().HasForeignKey(x => x.PickupLocationId);
        b.HasOne(x => x.DeliveryLocation).WithMany().HasForeignKey(x => x.DeliveryLocationId);
        b.HasOne(x => x.CurrentStatus).WithMany().HasForeignKey(x => x.CurrentStatusId);
        b.HasOne(x => x.CurrentDriver).WithMany().HasForeignKey(x => x.CurrentDriverId);
        b.HasOne(x => x.CurrentVehicle).WithMany().HasForeignKey(x => x.CurrentVehicleId);
    }
}

public class MissionStatusHistoryConfiguration : IEntityTypeConfiguration<MissionStatusHistory>
{
    public void Configure(EntityTypeBuilder<MissionStatusHistory> b)
    {
        b.ToTable("MissionStatusHistory");
        b.Property(x => x.Comment).HasMaxLength(1000);
        b.Property(x => x.Latitude).HasPrecision(9, 6);
        b.Property(x => x.Longitude).HasPrecision(9, 6);
        b.HasIndex(x => new { x.MissionId, x.ChangedAt });
        b.HasIndex(x => new { x.ToStatusId, x.ChangedAt });
        b.HasOne(x => x.Mission).WithMany(m => m.StatusHistory).HasForeignKey(x => x.MissionId);
        b.HasOne(x => x.FromStatus).WithMany().HasForeignKey(x => x.FromStatusId);
        b.HasOne(x => x.ToStatus).WithMany().HasForeignKey(x => x.ToStatusId);
        b.HasOne(x => x.ChangedByUser).WithMany().HasForeignKey(x => x.ChangedBy);
    }
}

public class MissionAssignmentConfiguration : IEntityTypeConfiguration<MissionAssignment>
{
    public void Configure(EntityTypeBuilder<MissionAssignment> b)
    {
        b.ToTable("MissionAssignment", t => t.HasCheckConstraint("CK_MissionAssignment_Status", Sql.In("Status", AssignmentStatuses.All)));
        b.Property(x => x.Status).HasMaxLength(20).IsRequired();
        b.Property(x => x.Comment).HasMaxLength(500);
        b.HasIndex(x => new { x.MissionId, x.AssignedAt });
        b.HasIndex(x => new { x.DriverId, x.Status });
        b.HasOne(x => x.Mission).WithMany(m => m.Assignments).HasForeignKey(x => x.MissionId);
        b.HasOne(x => x.Driver).WithMany(d => d.Assignments).HasForeignKey(x => x.DriverId);
        b.HasOne(x => x.Vehicle).WithMany().HasForeignKey(x => x.VehicleId);
        b.HasOne(x => x.AssignedByUser).WithMany().HasForeignKey(x => x.AssignedBy);
    }
}

public class DocumentTypeConfiguration : IEntityTypeConfiguration<DocumentType>
{
    public void Configure(EntityTypeBuilder<DocumentType> b)
    {
        b.ToTable("DocumentType");
        b.Property(x => x.Code).HasMaxLength(30).IsRequired();
        b.Property(x => x.Label).HasMaxLength(100).IsRequired();
        b.HasIndex(x => x.Code).IsUnique();
    }
}

public class DocumentConfiguration : IEntityTypeConfiguration<Document>
{
    public void Configure(EntityTypeBuilder<Document> b)
    {
        b.ToTable("Document", t => t.HasCheckConstraint("CK_Document_FileSize", "[FileSize] > 0"));
        b.Property(x => x.FileName).HasMaxLength(255).IsRequired();
        b.Property(x => x.StoragePath).HasMaxLength(500).IsRequired();
        b.Property(x => x.FileExtension).HasMaxLength(10).IsRequired();
        b.Property(x => x.MimeType).HasMaxLength(150).IsRequired();
        b.Property(x => x.Sha256).HasMaxLength(64);
        b.Property(x => x.Comment).HasMaxLength(500);
        b.HasIndex(x => x.StoragePath).IsUnique();
        b.HasIndex(x => new { x.MissionId, x.IsDeleted });
        b.HasIndex(x => x.UploadedAt);
        b.HasOne(x => x.Mission).WithMany(m => m.Documents).HasForeignKey(x => x.MissionId);
        b.HasOne(x => x.DocumentType).WithMany().HasForeignKey(x => x.DocumentTypeId);
        b.HasOne(x => x.UploadedByUser).WithMany().HasForeignKey(x => x.UploadedBy);
    }
}

public class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> b)
    {
        b.ToTable("AuditLog");
        b.Property(x => x.EntityName).HasMaxLength(60).IsRequired();
        b.Property(x => x.EntityId).HasMaxLength(60);
        b.Property(x => x.Action).HasMaxLength(40).IsRequired();
        b.Property(x => x.Description).HasMaxLength(1000);
        b.Property(x => x.OldValue).HasMaxLength(4000);
        b.Property(x => x.NewValue).HasMaxLength(4000);
        b.Property(x => x.IpAddress).HasMaxLength(64);
        b.Property(x => x.UserAgent).HasMaxLength(512);
        b.HasIndex(x => x.CreatedAt);
        b.HasIndex(x => new { x.EntityName, x.EntityId });
        b.HasIndex(x => new { x.UserId, x.CreatedAt });
        b.HasIndex(x => x.Action);
        b.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId);
    }
}

public class NotificationConfiguration : IEntityTypeConfiguration<Notification>
{
    public void Configure(EntityTypeBuilder<Notification> b)
    {
        b.ToTable("Notification", t => t.HasCheckConstraint("CK_Notification_Type",
            Sql.In("Type", new[] { NotificationTypes.Info, NotificationTypes.Success, NotificationTypes.Warning, NotificationTypes.Danger })));
        b.Property(x => x.Title).HasMaxLength(150).IsRequired();
        b.Property(x => x.Message).HasMaxLength(500).IsRequired();
        b.Property(x => x.Type).HasMaxLength(20).IsRequired();
        b.Property(x => x.EntityName).HasMaxLength(60);
        b.HasIndex(x => new { x.UserId, x.IsRead, x.CreatedAt });
        b.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId);
    }
}

public class SystemParameterConfiguration : IEntityTypeConfiguration<SystemParameter>
{
    public void Configure(EntityTypeBuilder<SystemParameter> b)
    {
        b.ToTable("SystemParameter");
        b.Property(x => x.Key).HasMaxLength(100).IsRequired();
        b.Property(x => x.Value).HasMaxLength(500).IsRequired();
        b.Property(x => x.Description).HasMaxLength(500);
        b.HasIndex(x => x.Key).IsUnique();
    }
}
