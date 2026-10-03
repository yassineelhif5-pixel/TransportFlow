namespace Transport.Domain.Common;

/// <summary>Base de toutes les entités métier : clé INT IDENTITY.</summary>
public abstract class BaseEntity
{
    public int Id { get; set; }
}

/// <summary>Entité horodatée et supprimable logiquement (soft delete).</summary>
public abstract class AuditableEntity : BaseEntity
{
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public int? CreatedBy { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public int? UpdatedBy { get; set; }
    public bool IsDeleted { get; set; }
}
