using Transport.Domain.Common;

namespace Transport.Domain.Entities;

public class Role : BaseEntity
{
    public string Code { get; set; } = default!;
    public string Name { get; set; } = default!;
    public ICollection<User> Users { get; set; } = new List<User>();
}

public class User : AuditableEntity
{
    public string Username { get; set; } = default!;
    public string Email { get; set; } = default!;
    public string PasswordHash { get; set; } = default!;
    public string FirstName { get; set; } = default!;
    public string LastName { get; set; } = default!;
    public string? Phone { get; set; }
    public int RoleId { get; set; }
    public Role Role { get; set; } = default!;
    public bool IsActive { get; set; } = true;

    /// <summary>Force le changement de mot de passe à la prochaine connexion.</summary>
    public bool MustChangePassword { get; set; }

    public int FailedLoginCount { get; set; }
    public DateTime? LockoutEndAt { get; set; }
    public DateTime? LastLoginAt { get; set; }

    /// <summary>Empreinte SHA-256 du refresh token courant (jamais le token en clair).</summary>
    public string? RefreshTokenHash { get; set; }
    public DateTime? RefreshTokenExpiresAt { get; set; }

    /// <summary>Incrémenté à chaque déconnexion / changement de mot de passe pour invalider les JWT émis.</summary>
    public int SecurityStamp { get; set; }

    public Driver? Driver { get; set; }

    public string FullName => $"{FirstName} {LastName}".Trim();
}
