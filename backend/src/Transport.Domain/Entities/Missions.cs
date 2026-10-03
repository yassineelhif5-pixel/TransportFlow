using Transport.Domain.Common;

namespace Transport.Domain.Entities;

public class MissionStatus : BaseEntity
{
    public string Code { get; set; } = default!;
    public string Label { get; set; } = default!;
    public int SortOrder { get; set; }
    public bool IsFinal { get; set; }
}

public class Mission : AuditableEntity
{
    public int ReferenceId { get; set; }
    public Reference Reference { get; set; } = default!;

    public int ClientId { get; set; }
    public Client Client { get; set; } = default!;

    public DateTime PlannedDate { get; set; }

    public int PickupLocationId { get; set; }
    public Location PickupLocation { get; set; } = default!;

    public int DeliveryLocationId { get; set; }
    public Location DeliveryLocation { get; set; } = default!;

    public string? Description { get; set; }
    public string? Goods { get; set; }
    public decimal? WeightKg { get; set; }
    public decimal? VolumeM3 { get; set; }

    public int CurrentStatusId { get; set; }
    public MissionStatus CurrentStatus { get; set; } = default!;

    /// <summary>Dénormalisation de l'affectation active pour des listes rapides.</summary>
    public int? CurrentDriverId { get; set; }
    public Driver? CurrentDriver { get; set; }
    public int? CurrentVehicleId { get; set; }
    public Vehicle? CurrentVehicle { get; set; }

    public DateTime? LastActionAt { get; set; }
    public string? LastAction { get; set; }

    public byte[] RowVersion { get; set; } = Array.Empty<byte>();

    public ICollection<MissionStatusHistory> StatusHistory { get; set; } = new List<MissionStatusHistory>();
    public ICollection<MissionAssignment> Assignments { get; set; } = new List<MissionAssignment>();
    public ICollection<Document> Documents { get; set; } = new List<Document>();
}

public class MissionStatusHistory : BaseEntity
{
    public int MissionId { get; set; }
    public Mission Mission { get; set; } = default!;
    public int? FromStatusId { get; set; }
    public MissionStatus? FromStatus { get; set; }
    public int ToStatusId { get; set; }
    public MissionStatus ToStatus { get; set; } = default!;
    public int ChangedBy { get; set; }
    public User ChangedByUser { get; set; } = default!;
    public DateTime ChangedAt { get; set; } = DateTime.UtcNow;
    public string? Comment { get; set; }

    /// <summary>Position GPS optionnelle, fournie par la future application mobile.</summary>
    public decimal? Latitude { get; set; }
    public decimal? Longitude { get; set; }
}

public class MissionAssignment : BaseEntity
{
    public int MissionId { get; set; }
    public Mission Mission { get; set; } = default!;
    public int DriverId { get; set; }
    public Driver Driver { get; set; } = default!;
    public int? VehicleId { get; set; }
    public Vehicle? Vehicle { get; set; }
    public int AssignedBy { get; set; }
    public User AssignedByUser { get; set; } = default!;
    public DateTime AssignedAt { get; set; } = DateTime.UtcNow;
    public string Status { get; set; } = Enums.AssignmentStatuses.Active;
    public DateTime? EndedAt { get; set; }
    public string? Comment { get; set; }
}

public class DocumentType : BaseEntity
{
    public string Code { get; set; } = default!;
    public string Label { get; set; } = default!;
}

public class Document : BaseEntity
{
    public int MissionId { get; set; }
    public Mission Mission { get; set; } = default!;
    public int DocumentTypeId { get; set; }
    public DocumentType DocumentType { get; set; } = default!;

    /// <summary>Nom d'origine fourni par l'utilisateur (affichage uniquement, jamais utilisé comme nom physique).</summary>
    public string FileName { get; set; } = default!;

    /// <summary>Clé de stockage opaque (GUID + extension). Jamais exposée au client.</summary>
    public string StoragePath { get; set; } = default!;
    public string FileExtension { get; set; } = default!;
    public string MimeType { get; set; } = default!;
    public long FileSize { get; set; }
    public string? Sha256 { get; set; }
    public int UploadedBy { get; set; }
    public User UploadedByUser { get; set; } = default!;
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
    public string? Comment { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
    public int? DeletedBy { get; set; }
}

public class AuditLog
{
    public long Id { get; set; }
    public int? UserId { get; set; }
    public User? User { get; set; }
    public string EntityName { get; set; } = default!;
    public string? EntityId { get; set; }
    public string Action { get; set; } = default!;
    public string? Description { get; set; }
    public string? OldValue { get; set; }
    public string? NewValue { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Notification : BaseEntity
{
    public int UserId { get; set; }
    public User User { get; set; } = default!;
    public string Title { get; set; } = default!;
    public string Message { get; set; } = default!;
    public string Type { get; set; } = Enums.NotificationTypes.Info;
    public string? EntityName { get; set; }
    public int? EntityId { get; set; }
    public bool IsRead { get; set; }
    public DateTime? ReadAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
