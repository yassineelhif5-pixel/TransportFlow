using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Transport.Api.Infrastructure;
using Transport.Application;
using Transport.Application.Common;
using Transport.Application.Interfaces;
using Transport.Domain.Enums;
using Transport.Infrastructure;
using Transport.Infrastructure.Data;
using Transport.Infrastructure.Data.Seed;
using Transport.Infrastructure.Security;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// ------------------------------------------------------------------ Services
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUserService, CurrentUserService>();
builder.Services.AddApplication();
builder.Services.AddInfrastructure(config);

// La validation métier (messages en français) est assurée par FluentValidation dans la couche Application.
builder.Services.AddControllers(o => o.SuppressImplicitRequiredAttributeForNonNullableReferenceTypes = true)
    .AddJsonOptions(o => o.JsonSerializerOptions.DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.Never)
    .ConfigureApiBehaviorOptions(o =>
    {
        // Erreurs de binding/format au même format que les erreurs métier.
        o.InvalidModelStateResponseFactory = ctx =>
        {
            var errors = ctx.ModelState.Where(e => e.Value?.Errors.Count > 0)
                .ToDictionary(e => string.IsNullOrEmpty(e.Key) ? "body" : char.ToLowerInvariant(e.Key.TrimStart('$', '.')[0]) + e.Key.TrimStart('$', '.')[1..],
                    e => e.Value!.Errors.Select(x => string.IsNullOrWhiteSpace(x.ErrorMessage) ? "Valeur invalide." : "Format de donnée invalide.").ToArray());
            return new BadRequestObjectResult(new ApiError(false, "Certaines données envoyées sont invalides.", "VALIDATION_ERROR", errors, ctx.HttpContext.TraceIdentifier));
        };
    });

// JWT ----------------------------------------------------------------
var jwt = config.GetSection(JwtOptions.Section).Get<JwtOptions>() ?? new JwtOptions();
if (Encoding.UTF8.GetByteCount(jwt.Secret) < 32)
    throw new InvalidOperationException("Jwt:Secret manquant ou trop court (≥ 32 caractères). Définissez la variable d'environnement Jwt__Secret.");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true, ValidIssuer = jwt.Issuer,
            ValidateAudience = true, ValidAudience = jwt.Audience,
            ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Secret)),
            ValidateLifetime = true, ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = ClaimTypes.Name, RoleClaimType = ClaimTypes.Role,
        };
        options.Events = new JwtBearerEvents
        {
            // Vérifie en base que le compte existe, est actif et que le jeton n'a pas été révoqué (déconnexion, changement de mot de passe).
            OnTokenValidated = async ctx =>
            {
                var db = ctx.HttpContext.RequestServices.GetRequiredService<ApplicationDbContext>();
                var idValue = ctx.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
                var stamp = ctx.Principal?.FindFirstValue(CustomClaims.SecurityStamp);
                if (!int.TryParse(idValue, out var userId)) { ctx.Fail("Jeton invalide."); return; }
                var user = await db.Users.AsNoTracking().Where(u => u.Id == userId)
                    .Select(u => new { u.IsActive, u.IsDeleted, u.SecurityStamp, Role = u.Role.Code }).FirstOrDefaultAsync();
                if (user is null || !user.IsActive || user.IsDeleted) { ctx.Fail("Compte inactif."); return; }
                if (stamp != user.SecurityStamp.ToString()) { ctx.Fail("Session révoquée."); return; }
                if (ctx.Principal?.FindFirstValue(ClaimTypes.Role) != user.Role) ctx.Fail("Rôle modifié.");
            },
            OnChallenge = async ctx =>
            {
                ctx.HandleResponse();
                var expired = ctx.AuthenticateFailure is SecurityTokenExpiredException;
                ctx.Response.StatusCode = 401;
                ctx.Response.ContentType = "application/json; charset=utf-8";
                ctx.Response.Headers["WWW-Authenticate"] = "Bearer";
                await ctx.Response.WriteAsync(JsonSerializer.Serialize(expired
                    ? new ApiError(false, "Votre session a expiré.", "TOKEN_EXPIRED")
                    : new ApiError(false, "Authentification requise.", "UNAUTHORIZED"), JsonDefaults.Options));
            },
            OnForbidden = async ctx =>
            {
                ctx.Response.StatusCode = 403;
                ctx.Response.ContentType = "application/json; charset=utf-8";
                await ctx.Response.WriteAsync(JsonSerializer.Serialize(
                    new ApiError(false, "Vous n'avez pas les droits nécessaires pour cette action.", "FORBIDDEN"), JsonDefaults.Options));
            },
        };
    });

builder.Services.AddAuthorization(o =>
{
    o.AddPolicy(Policies.Admin, p => p.RequireAuthenticatedUser().RequireRole(RoleCodes.Admin));
    o.AddPolicy(Policies.Driver, p => p.RequireAuthenticatedUser().RequireRole(RoleCodes.Driver));
    o.AddPolicy(Policies.AdminOrDriver, p => p.RequireAuthenticatedUser().RequireRole(RoleCodes.Admin, RoleCodes.Driver));
    // Sécurité par défaut : tout endpoint non annoté exige un utilisateur authentifié.
    o.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
});

// CORS ---------------------------------------------------------------
var origins = config.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
builder.Services.AddCors(o => o.AddPolicy("Frontend", p => p
    .WithOrigins(origins)
    .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE")
    .WithHeaders("Authorization", "Content-Type", "Accept", "X-Requested-With")
    .WithExposedHeaders("Content-Disposition")
    .SetPreflightMaxAge(TimeSpan.FromMinutes(10))));

// Limitation de débit (anti brute-force) ---------------------------------
var authPermit = config.GetValue("RateLimit:AuthPermitLimit", 10);
var globalPermit = config.GetValue("RateLimit:GlobalPermitLimit", 600);
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    o.OnRejected = async (ctx, ct) =>
    {
        ctx.HttpContext.Response.ContentType = "application/json; charset=utf-8";
        await ctx.HttpContext.Response.WriteAsync(JsonSerializer.Serialize(
            new ApiError(false, "Trop de requêtes. Patientez quelques instants.", "RATE_LIMITED"), JsonDefaults.Options), ct);
    };
    o.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = authPermit, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.User.Identity?.Name ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = globalPermit, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

// Upload -------------------------------------------------------------
var maxUploadMb = config.GetValue("Storage:MaxFileSizeMb", 10);
builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = (maxUploadMb + 2) * 1024L * 1024L);
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = (maxUploadMb + 5) * 1024L * 1024L);

builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownNetworks.Clear(); o.KnownProxies.Clear();
});

// Health checks --------------------------------------------------------
builder.Services.AddHealthChecks()
    .AddCheck<SqlServerHealthCheck>("sqlserver", tags: new[] { "ready" })
    .AddCheck<StorageHealthCheck>("storage", tags: new[] { "ready" });

// Swagger ------------------------------------------------------------
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "TransportFlow API",
        Version = "v1",
        Description = "API REST de gestion des missions de transport (Web Administration + future application Mobile Chauffeur). " +
                      "Authentifiez-vous via POST /api/auth/login puis cliquez sur « Authorize » et collez le accessToken.",
    });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization", Type = SecuritySchemeType.Http, Scheme = "bearer", BearerFormat = "JWT", In = ParameterLocation.Header,
        Description = "Jeton JWT obtenu via /api/auth/login",
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        { new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } }, Array.Empty<string>() },
    });
    var xml = Path.Combine(AppContext.BaseDirectory, "Transport.Api.xml");
    if (File.Exists(xml)) c.IncludeXmlComments(xml);
    c.CustomSchemaIds(t => t.FullName?.Replace("Transport.Application.", "").Replace("+", "."));
});

var app = builder.Build();

// ------------------------------------------------------------------ Pipeline
app.UseForwardedHeaders();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseMiddleware<RequestLoggingMiddleware>();

if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

if (app.Environment.IsDevelopment() || config.GetValue("Swagger:Enabled", false))
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "TransportFlow API v1");
        c.DocumentTitle = "TransportFlow API";
    });
}

app.UseCors("Frontend");
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();

app.MapControllers();
app.MapHealthChecks("/health", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    ResponseWriter = async (ctx, report) =>
    {
        ctx.Response.ContentType = "application/json; charset=utf-8";
        var payload = new
        {
            status = report.Status.ToString(),
            totalDurationMs = (int)report.TotalDuration.TotalMilliseconds,
            components = new Dictionary<string, object>
            {
                ["api"] = new { status = "Healthy", description = "API opérationnelle." },
            }.Concat(report.Entries.ToDictionary(e => e.Key, e => (object)new { status = e.Value.Status.ToString(), description = e.Value.Description, durationMs = (int)e.Value.Duration.TotalMilliseconds }))
             .ToDictionary(kv => kv.Key, kv => kv.Value),
        };
        await ctx.Response.WriteAsync(JsonSerializer.Serialize(payload, JsonDefaults.Options));
    },
    ResultStatusCodes =
    {
        [HealthStatus.Healthy] = 200, [HealthStatus.Degraded] = 200, [HealthStatus.Unhealthy] = 503,
    },
}).AllowAnonymous();

// Initialisation de la base (migrations + seed) --------------------------------
if (!config.GetValue("Database:SkipInitialization", false))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync();
}

app.Run();

public static class Policies
{
    public const string Admin = "AdminOnly";
    public const string Driver = "DriverOnly";
    public const string AdminOrDriver = "AdminOrDriver";
}

public partial class Program { }
