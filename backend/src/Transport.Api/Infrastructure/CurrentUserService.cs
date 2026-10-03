using System.Security.Claims;
using Transport.Application.Common;
using Transport.Application.Interfaces;
using Transport.Domain.Enums;

namespace Transport.Api.Infrastructure;

/// <summary>Utilisateur courant extrait du JWT déjà validé par le middleware d'authentification.</summary>
public class CurrentUserService : ICurrentUserService
{
    private readonly IHttpContextAccessor _accessor;
    public CurrentUserService(IHttpContextAccessor accessor) => _accessor = accessor;

    private ClaimsPrincipal? Principal => _accessor.HttpContext?.User;

    public int? UserId =>
        int.TryParse(Principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    public string? Username => Principal?.FindFirstValue(ClaimTypes.Name);
    public string? Role => Principal?.FindFirstValue(ClaimTypes.Role);
    public bool IsAdmin => Role == RoleCodes.Admin;
    public string? IpAddress => _accessor.HttpContext?.Connection.RemoteIpAddress?.ToString();
    public string? UserAgent => _accessor.HttpContext?.Request.Headers.UserAgent.ToString();

    public int RequireUserId() => UserId ?? throw new UnauthorizedAppException("UNAUTHORIZED", "Authentification requise.");
}
