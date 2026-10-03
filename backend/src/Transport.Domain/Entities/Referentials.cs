using Transport.Domain.Common;

namespace Transport.Domain.Entities;

public class Driver : AuditableEntity
{
    /// <summary>Compte utilisateur (rôle DRIVER) utilisé par la future application mobile.</summary>
    public int? UserId { get; set; }
    public User? User { get; set; }

    public string FirstName { get; set; } = default!;
    public string LastName { get; set; } = default!;
    public string? Email { get; set; }
    public string Phone { get; set; } = default!;
    public string LicenseNumber { get; set; } = default!;
    public DateTime LicenseExpiryDate { get; set; }

    public int? DefaultVehicleId { get; set; }
    public Vehicle? DefaultVehicle { get; set; }

    public bool IsActive { get; set; } = true;

    public ICollection<MissionAssignment> Assignments { get; set; } = new List<MissionAssignment>();

    public string FullName => $"{FirstName} {LastName}".Trim();
}

public class Vehicle : AuditableEntity
{
    public string PlateNumber { get; set; } = default!;
    public string Brand { get; set; } = default!;
    public string Model { get; set; } = default!;
    public string Type { get; set; } = default!;
    public decimal CapacityKg { get; set; }
    public decimal? CapacityM3 { get; set; }
    public string Status { get; set; } = Enums.VehicleStatuses.Available;
    public bool IsActive { get; set; } = true;
}

public class Client : AuditableEntity
{
    public string Code { get; set; } = default!;
    public string Name { get; set; } = default!;
    public string? Address { get; set; }
    public string? City { get; set; }
    public string? PostalCode { get; set; }
    public string Country { get; set; } = "France";
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<Reference> References { get; set; } = new List<Reference>();
    public ICollection<Mission> Missions { get; set; } = new List<Mission>();
}

public class Reference : AuditableEntity
{
    public string Number { get; set; } = default!;
    public int ClientId { get; set; }
    public Client Client { get; set; } = default!;
    public string Source { get; set; } = Enums.ReferenceSources.Manual;
    public string Status { get; set; } = Enums.ReferenceStatuses.Open;
    public string? Notes { get; set; }

    /// <summary>Missions liées (au plus une non supprimée ; les missions supprimées logiquement restent en historique).</summary>
    public ICollection<Mission> Missions { get; set; } = new List<Mission>();
}

public class Location : BaseEntity
{
    public string? Label { get; set; }
    public string Address { get; set; } = default!;
    public string City { get; set; } = default!;
    public string? PostalCode { get; set; }
    public string Country { get; set; } = "France";
    public decimal? Latitude { get; set; }
    public decimal? Longitude { get; set; }
}

public class SystemParameter : BaseEntity
{
    public string Key { get; set; } = default!;
    public string Value { get; set; } = default!;
    public string? Description { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public int? UpdatedBy { get; set; }
}
