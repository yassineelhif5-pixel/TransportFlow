using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Transport.Application.Auth;
using Transport.Application.Common;
using Transport.Application.Users;

namespace Transport.Api.Controllers;

[ApiController]
[Produces("application/json")]
public abstract class ApiControllerBase : ControllerBase
{
    protected OkObjectResult Success<T>(T data, string? message = null) => Ok(ApiResponse.Ok(data, message));
    protected OkObjectResult Success(string message) => Ok(new ApiResponse<object?>(true, null, message));

    protected FileStreamResult FileResult(byte[] content, string contentType, string fileName) =>
        File(new MemoryStream(content), contentType, fileName);
}

/// <summary>Authentification JWT : connexion, rafraîchissement, déconnexion, mot de passe, profil.</summary>
[Route("api/auth")]
public class AuthController : ApiControllerBase
{
    private readonly IAuthService _auth;
    private readonly IUserService _users;

    public AuthController(IAuthService auth, IUserService users)
    {
        _auth = auth; _users = users;
    }

    /// <summary>Connexion (identifiant ou e-mail + mot de passe). Retourne un accessToken JWT et un refreshToken.</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [ProducesResponseType(typeof(ApiResponse<LoginResponse>), 200)]
    [ProducesResponseType(typeof(ApiError), 401)]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken ct) =>
        Success(await _auth.LoginAsync(request, ct));

    /// <summary>Échange un refreshToken valide contre une nouvelle paire de jetons (rotation).</summary>
    [HttpPost("refresh")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest request, CancellationToken ct) =>
        Success(await _auth.RefreshAsync(request, ct));

    /// <summary>Déconnexion : révoque le refreshToken et invalide les JWT déjà émis.</summary>
    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        await _auth.LogoutAsync(ct);
        return Success("Déconnexion effectuée.");
    }

    [HttpPost("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request, CancellationToken ct) =>
        Success(await _auth.ChangePasswordAsync(request, ct), "Mot de passe modifié.");

    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me(CancellationToken ct) => Success(await _auth.MeAsync(ct));

    [HttpPut("me")]
    [Authorize]
    public async Task<IActionResult> UpdateProfile([FromBody] ProfileUpdateRequest request, CancellationToken ct) =>
        Success(await _users.UpdateProfileAsync(request, ct), "Profil mis à jour.");
}
