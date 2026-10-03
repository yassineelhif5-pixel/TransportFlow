using System.Security.Cryptography;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Transport.Application.Auth;
using Transport.Application.Common;
using Transport.Application.Interfaces;
using Transport.Domain.Entities;
using Transport.Domain.Enums;

namespace Transport.Application.Users;

public record UserDto(int Id, string Username, string Email, string FirstName, string LastName, string FullName, string? Phone,
    string Role, bool IsActive, bool MustChangePassword, DateTime? LastLoginAt, DateTime CreatedAt, bool IsLocked, int? DriverId);

public record UserCreateRequest(string Username, string Email, string FirstName, string LastName, string? Phone, string Role, string Password);
public record UserUpdateRequest(string Email, string FirstName, string LastName, string? Phone, string Role);
public record ProfileUpdateRequest(string Email, string FirstName, string LastName, string? Phone);
public record ResetPasswordResultDto(string TemporaryPassword);

public class UserQuery : PagedQuery
{
    public string? Role { get; set; }
    public bool? IsActive { get; set; }
}

public class UserCreateRequestValidator : AbstractValidator<UserCreateRequest>
{
    public UserCreateRequestValidator()
    {
        RuleFor(x => x.Username).NotEmpty().WithMessage("L'identifiant est obligatoire.").MaximumLength(100)
            .Matches("^[a-zA-Z0-9._@-]+$").WithMessage("Identifiant invalide (lettres, chiffres, . _ @ -).");
        RuleFor(x => x.Email).NotEmpty().WithMessage("L'e-mail est obligatoire.").EmailAddress().WithMessage("Adresse e-mail invalide.").MaximumLength(256);
        RuleFor(x => x.FirstName).NotEmpty().WithMessage("Le prénom est obligatoire.").MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().WithMessage("Le nom est obligatoire.").MaximumLength(100);
        RuleFor(x => x.Role).Must(r => RoleCodes.All.Contains(r)).WithMessage("Rôle invalide.");
        RuleFor(x => x.Password).StrongPassword();
    }
}

public class UserUpdateRequestValidator : AbstractValidator<UserUpdateRequest>
{
    public UserUpdateRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().WithMessage("L'e-mail est obligatoire.").EmailAddress().WithMessage("Adresse e-mail invalide.").MaximumLength(256);
        RuleFor(x => x.FirstName).NotEmpty().WithMessage("Le prénom est obligatoire.").MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().WithMessage("Le nom est obligatoire.").MaximumLength(100);
        RuleFor(x => x.Role).Must(r => RoleCodes.All.Contains(r)).WithMessage("Rôle invalide.");
    }
}

public class ProfileUpdateRequestValidator : AbstractValidator<ProfileUpdateRequest>
{
    public ProfileUpdateRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().WithMessage("L'e-mail est obligatoire.").EmailAddress().WithMessage("Adresse e-mail invalide.").MaximumLength(256);
        RuleFor(x => x.FirstName).NotEmpty().WithMessage("Le prénom est obligatoire.").MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().WithMessage("Le nom est obligatoire.").MaximumLength(100);
        RuleFor(x => x.Phone).Matches(@"^\+?[0-9 .\-()]{6,20}$").WithMessage("Numéro de téléphone invalide.").When(x => !string.IsNullOrWhiteSpace(x.Phone));
    }
}

public interface IUserService
{
    Task<PagedResult<UserDto>> ListAsync(UserQuery q, CancellationToken ct);
    Task<UserDto> GetAsync(int id, CancellationToken ct);
    Task<UserDto> CreateAsync(UserCreateRequest r, CancellationToken ct);
    Task<UserDto> UpdateAsync(int id, UserUpdateRequest r, CancellationToken ct);
    Task<UserDto> SetActiveAsync(int id, bool isActive, CancellationToken ct);
    Task<ResetPasswordResultDto> ResetPasswordAsync(int id, CancellationToken ct);
    Task<UserInfoDto> UpdateProfileAsync(ProfileUpdateRequest r, CancellationToken ct);
}

public class UserService : IUserService
{
    private readonly IApplicationDbContext _db;
    private readonly ICurrentUserService _current;
    private readonly IAuditService _audit;
    private readonly IPasswordHasherService _hasher;
    private readonly IValidator<UserCreateRequest> _createValidator;
    private readonly IValidator<UserUpdateRequest> _updateValidator;
    private readonly IValidator<ProfileUpdateRequest> _profileValidator;

    public UserService(IApplicationDbContext db, ICurrentUserService current, IAuditService audit, IPasswordHasherService hasher,
        IValidator<UserCreateRequest> createValidator, IValidator<UserUpdateRequest> updateValidator, IValidator<ProfileUpdateRequest> profileValidator)
    {
        _db = db; _current = current; _audit = audit; _hasher = hasher;
        _createValidator = createValidator; _updateValidator = updateValidator; _profileValidator = profileValidator;
    }

    private IQueryable<UserDto> Query(UserQuery q)
    {
        var now = DateTime.UtcNow;
        var query = _db.Users.AsNoTracking().Where(u => !u.IsDeleted);
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(u => u.Username.Contains(s) || u.Email.Contains(s) || u.LastName.Contains(s) || u.FirstName.Contains(s));
        }
        if (!string.IsNullOrWhiteSpace(q.Role)) query = query.Where(u => u.Role.Code == q.Role);
        if (q.IsActive is { } a) query = query.Where(u => u.IsActive == a);
        query = q.SortBy?.ToLowerInvariant() switch
        {
            "email" => query.OrderByDir(u => u.Email, q.Descending),
            "role" => query.OrderByDir(u => u.Role.Code, q.Descending),
            "lastlogin" => query.OrderByDir(u => u.LastLoginAt, q.DescendingOrDefault),
            _ => query.OrderByDir(u => u.LastName, q.Descending),
        };
        return query.Select(u => new UserDto(u.Id, u.Username, u.Email, u.FirstName, u.LastName, u.FirstName + " " + u.LastName, u.Phone,
            u.Role.Code, u.IsActive, u.MustChangePassword, u.LastLoginAt, u.CreatedAt, u.LockoutEndAt != null && u.LockoutEndAt > now,
            u.Driver != null ? (int?)u.Driver.Id : null));
    }

    public Task<PagedResult<UserDto>> ListAsync(UserQuery q, CancellationToken ct) => Query(q).ToPagedAsync(q, ct);

    public async Task<UserDto> GetAsync(int id, CancellationToken ct) =>
        await Query(new UserQuery()).FirstOrDefaultAsync(u => u.Id == id, ct)
        ?? throw new NotFoundException("USER_NOT_FOUND", "L'utilisateur n'existe pas.");

    public async Task<UserDto> CreateAsync(UserCreateRequest r, CancellationToken ct)
    {
        await _createValidator.EnsureValidAsync(r, ct);
        var username = r.Username.Trim().ToLowerInvariant();
        var email = r.Email.Trim().ToLowerInvariant();
        await EnsureUniqueAsync(username, email, null, ct);
        var role = await _db.Roles.FirstAsync(x => x.Code == r.Role, ct);
        var user = new User
        {
            Username = username, Email = email, FirstName = r.FirstName.Trim(), LastName = r.LastName.Trim().ToUpperInvariant(),
            Phone = TextUtils.Clean(r.Phone), RoleId = role.Id, PasswordHash = _hasher.Hash(r.Password), IsActive = true,
            MustChangePassword = true, CreatedAt = DateTime.UtcNow, CreatedBy = _current.UserId,
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);
        _audit.Add("User", user.Id, AuditActions.Create, $"Utilisateur {user.FullName} ({role.Code}) créé.");
        await _db.SaveChangesAsync(ct);
        return await GetAsync(user.Id, ct);
    }

    public async Task<UserDto> UpdateAsync(int id, UserUpdateRequest r, CancellationToken ct)
    {
        await _updateValidator.EnsureValidAsync(r, ct);
        var user = await Load(id, ct);
        var email = r.Email.Trim().ToLowerInvariant();
        await EnsureUniqueAsync(null, email, id, ct);
        if (user.Role.Code != r.Role)
        {
            if (id == _current.UserId) throw new BusinessRuleException("CANNOT_CHANGE_OWN_ROLE", "Vous ne pouvez pas modifier votre propre rôle.");
            if (user.Role.Code == RoleCodes.Admin) await EnsureAnotherAdminAsync(id, ct);
            user.RoleId = (await _db.Roles.FirstAsync(x => x.Code == r.Role, ct)).Id;
            user.SecurityStamp++;
        }
        var before = new { user.Email, user.FirstName, user.LastName, user.Phone, Role = user.Role.Code };
        user.Email = email;
        user.FirstName = r.FirstName.Trim();
        user.LastName = r.LastName.Trim().ToUpperInvariant();
        user.Phone = TextUtils.Clean(r.Phone);
        user.UpdatedAt = DateTime.UtcNow;
        user.UpdatedBy = _current.UserId;
        _audit.Add("User", user.Id, AuditActions.Update, $"Utilisateur {user.FullName} modifié.", before, new { user.Email, user.FirstName, user.LastName, user.Phone, Role = r.Role });
        await _db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task<UserDto> SetActiveAsync(int id, bool isActive, CancellationToken ct)
    {
        var user = await Load(id, ct);
        if (!isActive)
        {
            if (id == _current.UserId) throw new BusinessRuleException("CANNOT_DISABLE_SELF", "Vous ne pouvez pas désactiver votre propre compte.");
            if (user.Role.Code == RoleCodes.Admin) await EnsureAnotherAdminAsync(id, ct);
            user.SecurityStamp++;
            user.RefreshTokenHash = null;
        }
        user.IsActive = isActive;
        if (isActive) { user.LockoutEndAt = null; user.FailedLoginCount = 0; }
        user.UpdatedAt = DateTime.UtcNow;
        user.UpdatedBy = _current.UserId;
        _audit.Add("User", user.Id, AuditActions.Update, $"Utilisateur {user.FullName} {(isActive ? "activé" : "désactivé")}.",
            new { IsActive = !isActive }, new { IsActive = isActive });
        await _db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task<ResetPasswordResultDto> ResetPasswordAsync(int id, CancellationToken ct)
    {
        var user = await Load(id, ct);
        var temp = GenerateTemporaryPassword();
        user.PasswordHash = _hasher.Hash(temp);
        user.MustChangePassword = true;
        user.SecurityStamp++;
        user.RefreshTokenHash = null;
        user.FailedLoginCount = 0;
        user.LockoutEndAt = null;
        user.UpdatedAt = DateTime.UtcNow;
        user.UpdatedBy = _current.UserId;
        _audit.Add("User", user.Id, AuditActions.Update, $"Mot de passe de {user.FullName} réinitialisé.");
        await _db.SaveChangesAsync(ct);
        // Le mot de passe temporaire n'est renvoyé qu'une seule fois et n'est jamais journalisé.
        return new ResetPasswordResultDto(temp);
    }

    public async Task<UserInfoDto> UpdateProfileAsync(ProfileUpdateRequest r, CancellationToken ct)
    {
        await _profileValidator.EnsureValidAsync(r, ct);
        var user = await Load(_current.RequireUserId(), ct);
        var email = r.Email.Trim().ToLowerInvariant();
        await EnsureUniqueAsync(null, email, user.Id, ct);
        user.Email = email;
        user.FirstName = r.FirstName.Trim();
        user.LastName = r.LastName.Trim().ToUpperInvariant();
        user.Phone = TextUtils.Clean(r.Phone);
        user.UpdatedAt = DateTime.UtcNow;
        user.UpdatedBy = user.Id;
        _audit.Add("User", user.Id, AuditActions.Update, $"Profil de {user.FullName} mis à jour.");
        await _db.SaveChangesAsync(ct);
        return AuthService.ToInfo(user);
    }

    private async Task<User> Load(int id, CancellationToken ct) =>
        await _db.Users.Include(u => u.Role).FirstOrDefaultAsync(u => u.Id == id && !u.IsDeleted, ct)
        ?? throw new NotFoundException("USER_NOT_FOUND", "L'utilisateur n'existe pas.");

    private async Task EnsureUniqueAsync(string? username, string email, int? id, CancellationToken ct)
    {
        if (username is not null && await _db.Users.AnyAsync(u => u.Username == username && u.Id != id, ct))
            throw new ConflictException("USERNAME_EXISTS", "Cet identifiant est déjà utilisé.");
        if (await _db.Users.AnyAsync(u => u.Email == email && u.Id != id, ct))
            throw new ConflictException("EMAIL_EXISTS", "Cette adresse e-mail est déjà utilisée.");
    }

    private async Task EnsureAnotherAdminAsync(int excludedId, CancellationToken ct)
    {
        var others = await _db.Users.CountAsync(u => u.Id != excludedId && u.IsActive && !u.IsDeleted && u.Role.Code == RoleCodes.Admin, ct);
        if (others == 0) throw new BusinessRuleException("LAST_ADMIN", "Il doit rester au moins un administrateur actif.");
    }

    internal static string GenerateTemporaryPassword()
    {
        const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ", lower = "abcdefghijkmnpqrstuvwxyz", digits = "23456789", symbols = "!@#$%*?";
        var all = upper + lower + digits + symbols;
        var chars = new List<char>
        {
            upper[RandomNumberGenerator.GetInt32(upper.Length)], lower[RandomNumberGenerator.GetInt32(lower.Length)],
            digits[RandomNumberGenerator.GetInt32(digits.Length)], symbols[RandomNumberGenerator.GetInt32(symbols.Length)],
        };
        while (chars.Count < 14) chars.Add(all[RandomNumberGenerator.GetInt32(all.Length)]);
        return new string(chars.OrderBy(_ => RandomNumberGenerator.GetInt32(1000)).ToArray());
    }
}
