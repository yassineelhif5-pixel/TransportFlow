using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Transport.Application.Common;
using Transport.Application.Interfaces;
using Transport.Domain.Entities;
using Transport.Domain.Enums;

namespace Transport.Application.Auth;

public interface IAuthService
{
    Task<LoginResponse> LoginAsync(LoginRequest request, CancellationToken ct);
    Task<LoginResponse> RefreshAsync(RefreshRequest request, CancellationToken ct);
    Task LogoutAsync(CancellationToken ct);
    Task<LoginResponse> ChangePasswordAsync(ChangePasswordRequest request, CancellationToken ct);
    Task<UserInfoDto> MeAsync(CancellationToken ct);
}

public class AuthService : IAuthService
{
    public const int MaxFailedAttempts = 5;
    public static readonly TimeSpan LockoutDuration = TimeSpan.FromMinutes(15);

    private readonly IApplicationDbContext _db;
    private readonly IPasswordHasherService _hasher;
    private readonly ITokenService _tokens;
    private readonly ICurrentUserService _current;
    private readonly IAuditService _audit;
    private readonly IValidator<LoginRequest> _loginValidator;
    private readonly IValidator<ChangePasswordRequest> _pwdValidator;

    public AuthService(IApplicationDbContext db, IPasswordHasherService hasher, ITokenService tokens,
        ICurrentUserService current, IAuditService audit,
        IValidator<LoginRequest> loginValidator, IValidator<ChangePasswordRequest> pwdValidator)
    {
        _db = db; _hasher = hasher; _tokens = tokens; _current = current; _audit = audit;
        _loginValidator = loginValidator; _pwdValidator = pwdValidator;
    }

    public async Task<LoginResponse> LoginAsync(LoginRequest request, CancellationToken ct)
    {
        await _loginValidator.EnsureValidAsync(request, ct);
        var login = request.Username.Trim();

        var user = await _db.Users.Include(u => u.Role)
            .FirstOrDefaultAsync(u => !u.IsDeleted && (u.Username == login || u.Email == login), ct);

        if (user is null)
        {
            // Même message que pour un mauvais mot de passe : pas d'énumération de comptes.
            _audit.Add("User", null, AuditActions.LoginFailed, $"Tentative de connexion échouée pour « {Truncate(login, 60)} ».");
            await _db.SaveChangesAsync(ct);
            throw new UnauthorizedAppException("INVALID_CREDENTIALS", "Identifiants incorrects.");
        }

        if (user.LockoutEndAt is { } lockEnd && lockEnd > DateTime.UtcNow)
        {
            var minutes = Math.Max(1, (int)Math.Ceiling((lockEnd - DateTime.UtcNow).TotalMinutes));
            throw new AppException("ACCOUNT_LOCKED",
                $"Trop de tentatives. Réessayez dans {minutes} minute{(minutes > 1 ? "s" : "")}.", 423);
        }

        if (!_hasher.Verify(user.PasswordHash, request.Password, out var needsRehash))
        {
            user.FailedLoginCount++;
            if (user.FailedLoginCount >= MaxFailedAttempts)
            {
                user.LockoutEndAt = DateTime.UtcNow.Add(LockoutDuration);
                user.FailedLoginCount = 0;
            }
            _audit.Add("User", user.Id, AuditActions.LoginFailed, $"Mot de passe incorrect pour {user.Username}.", userIdOverride: user.Id);
            await _db.SaveChangesAsync(ct);
            throw new UnauthorizedAppException("INVALID_CREDENTIALS", "Identifiants incorrects.");
        }

        if (!user.IsActive)
            throw new AppException("ACCOUNT_DISABLED", "Votre compte est désactivé.", 403);

        if (string.Equals(request.Audience, "admin", StringComparison.OrdinalIgnoreCase) && user.Role.Code != RoleCodes.Admin)
            throw new AppException("ADMIN_ONLY", "Cet espace est réservé aux administrateurs.", 403);

        if (needsRehash) user.PasswordHash = _hasher.Hash(request.Password);
        user.FailedLoginCount = 0;
        user.LockoutEndAt = null;
        user.LastLoginAt = DateTime.UtcNow;

        var refresh = IssueRefreshToken(user, request.RememberMe);
        _audit.Add("User", user.Id, AuditActions.Login, $"Connexion de {user.FullName}.", userIdOverride: user.Id);
        await _db.SaveChangesAsync(ct);

        return BuildResponse(user, refresh);
    }

    public async Task<LoginResponse> RefreshAsync(RefreshRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken))
            throw new UnauthorizedAppException("INVALID_REFRESH_TOKEN", "Votre session a expiré.");

        var hash = _tokens.HashRefreshToken(request.RefreshToken);
        var user = await _db.Users.Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.RefreshTokenHash == hash && !u.IsDeleted, ct);

        if (user is null || user.RefreshTokenExpiresAt is null || user.RefreshTokenExpiresAt < DateTime.UtcNow)
            throw new UnauthorizedAppException("SESSION_EXPIRED", "Votre session a expiré.");
        if (!user.IsActive)
            throw new AppException("ACCOUNT_DISABLED", "Votre compte est désactivé.", 403);

        // Rotation : l'ancien refresh token devient inutilisable.
        var remember = user.RefreshTokenExpiresAt.Value - DateTime.UtcNow > TimeSpan.FromDays(1);
        var refresh = IssueRefreshToken(user, remember);
        await _db.SaveChangesAsync(ct);
        return BuildResponse(user, refresh);
    }

    public async Task LogoutAsync(CancellationToken ct)
    {
        var userId = _current.RequireUserId();
        var user = await _db.Users.FirstAsync(u => u.Id == userId, ct);
        user.RefreshTokenHash = null;
        user.RefreshTokenExpiresAt = null;
        user.SecurityStamp++; // invalide les JWT déjà émis
        _audit.Add("User", user.Id, AuditActions.Logout, $"Déconnexion de {user.FullName}.");
        await _db.SaveChangesAsync(ct);
    }

    public async Task<LoginResponse> ChangePasswordAsync(ChangePasswordRequest request, CancellationToken ct)
    {
        await _pwdValidator.EnsureValidAsync(request, ct);
        var userId = _current.RequireUserId();
        var user = await _db.Users.Include(u => u.Role).FirstAsync(u => u.Id == userId, ct);

        if (!_hasher.Verify(user.PasswordHash, request.CurrentPassword, out _))
            throw new ValidationAppException(new Dictionary<string, string[]>
            {
                ["currentPassword"] = new[] { "L'ancien mot de passe est incorrect." }
            });

        user.PasswordHash = _hasher.Hash(request.NewPassword);
        user.MustChangePassword = false;
        user.SecurityStamp++;
        user.UpdatedAt = DateTime.UtcNow;
        user.UpdatedBy = userId;
        var refresh = IssueRefreshToken(user, false);
        _audit.Add("User", user.Id, AuditActions.PasswordChange, $"Mot de passe modifié par {user.FullName}.");
        await _db.SaveChangesAsync(ct);
        return BuildResponse(user, refresh);
    }

    public async Task<UserInfoDto> MeAsync(CancellationToken ct)
    {
        var userId = _current.RequireUserId();
        var user = await _db.Users.Include(u => u.Role).AsNoTracking().FirstAsync(u => u.Id == userId, ct);
        return ToInfo(user);
    }

    private string IssueRefreshToken(User user, bool rememberMe)
    {
        var token = _tokens.CreateRefreshToken();
        user.RefreshTokenHash = _tokens.HashRefreshToken(token);
        user.RefreshTokenExpiresAt = DateTime.UtcNow.Add(rememberMe ? _tokens.RefreshTokenLifetime : TimeSpan.FromHours(12));
        return token;
    }

    private LoginResponse BuildResponse(User user, string refreshToken)
    {
        var access = _tokens.CreateAccessToken(user, user.Role.Code);
        return new LoginResponse(access.AccessToken, refreshToken, access.ExpiresIn, access.ExpiresAt, ToInfo(user));
    }

    internal static UserInfoDto ToInfo(User u) => new(
        u.Id, u.Username, u.Email, u.FirstName, u.LastName, u.FullName, u.Role.Code, u.Phone, u.LastLoginAt, u.MustChangePassword);

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max];
}
