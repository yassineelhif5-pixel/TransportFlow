using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Transport.Application.Interfaces;
using Transport.Domain.Entities;

namespace Transport.Infrastructure.Security;

public class JwtOptions
{
    public const string Section = "Jwt";
    public string Issuer { get; set; } = "TransportFlow";
    public string Audience { get; set; } = "TransportFlow.Clients";
    /// <summary>Clé HMAC (≥ 32 caractères). Fournie par variable d'environnement Jwt__Secret, jamais commitée.</summary>
    public string Secret { get; set; } = string.Empty;
    public int AccessTokenMinutes { get; set; } = 60;
    public int RefreshTokenDays { get; set; } = 30;
}

public static class CustomClaims
{
    public const string SecurityStamp = "sstamp";
}

public class TokenService : ITokenService
{
    private readonly JwtOptions _options;

    public TokenService(IOptions<JwtOptions> options)
    {
        _options = options.Value;
        if (Encoding.UTF8.GetByteCount(_options.Secret) < 32)
            throw new InvalidOperationException("Jwt:Secret doit contenir au moins 32 caractères (variable d'environnement Jwt__Secret).");
    }

    public TimeSpan RefreshTokenLifetime => TimeSpan.FromDays(_options.RefreshTokenDays);

    public TokenResult CreateAccessToken(User user, string roleCode)
    {
        var expires = DateTime.UtcNow.AddMinutes(_options.AccessTokenMinutes);
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.UniqueName, user.Username),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Username),
            new(ClaimTypes.Role, roleCode),
            new(CustomClaims.SecurityStamp, user.SecurityStamp.ToString()),
        };
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.Secret));
        var token = new JwtSecurityToken(_options.Issuer, _options.Audience, claims, DateTime.UtcNow, expires,
            new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
        return new TokenResult(new JwtSecurityTokenHandler().WriteToken(token), expires, _options.AccessTokenMinutes * 60);
    }

    public string CreateRefreshToken() => Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(48));

    public string HashRefreshToken(string refreshToken) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(refreshToken)));
}

/// <summary>Hachage PBKDF2 (HMAC-SHA512, sel aléatoire) via le PasswordHasher d'ASP.NET Core Identity.</summary>
public class PasswordHasherService : IPasswordHasherService
{
    private static readonly PasswordHasher<User> Hasher = new();

    public string Hash(string password) => Hasher.HashPassword(null!, password);

    public bool Verify(string hash, string password, out bool needsRehash)
    {
        needsRehash = false;
        if (string.IsNullOrEmpty(hash)) return false;
        PasswordVerificationResult result;
        try { result = Hasher.VerifyHashedPassword(null!, hash, password); }
        catch (FormatException) { return false; }
        needsRehash = result == PasswordVerificationResult.SuccessRehashNeeded;
        return result != PasswordVerificationResult.Failed;
    }
}
