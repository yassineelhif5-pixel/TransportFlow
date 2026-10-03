using System.Diagnostics;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Transport.Application.Common;

namespace Transport.Api.Infrastructure;

/// <summary>Traduit toute exception en réponse JSON cohérente { success: false, message, code }.
/// Les détails techniques (SQL, stack trace) ne sont jamais exposés au client.</summary>
public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next; _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex) when (!context.Response.HasStarted)
        {
            var traceId = Activity.Current?.Id ?? context.TraceIdentifier;
            ApiError error;
            int status;

            switch (ex)
            {
                case AppException app:
                    status = app.StatusCode;
                    error = new ApiError(false, app.Message, app.Code, app.Errors, traceId);
                    if (status >= 500) _logger.LogError(ex, "Erreur applicative {Code}", app.Code);
                    else _logger.LogInformation("Règle métier {Code} sur {Method} {Path} : {Message}", app.Code, context.Request.Method, context.Request.Path, app.Message);
                    break;
                case DbUpdateConcurrencyException:
                    status = 409;
                    error = new ApiError(false, "Les données ont été modifiées par un autre utilisateur. Rechargez la page.", "CONCURRENCY_CONFLICT", null, traceId);
                    break;
                case DbUpdateException dbEx:
                    status = 409;
                    error = new ApiError(false, "L'opération est incompatible avec les données existantes (doublon ou lien manquant).", "DATABASE_CONSTRAINT", null, traceId);
                    _logger.LogError(dbEx, "Erreur SQL lors de {Method} {Path}", context.Request.Method, context.Request.Path);
                    break;
                case OperationCanceledException when context.RequestAborted.IsCancellationRequested:
                    return; // client déconnecté
                case BadHttpRequestException bad:
                    status = bad.StatusCode;
                    error = new ApiError(false, status == 413 ? "Le fichier envoyé est trop volumineux." : "Requête invalide.", status == 413 ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST", null, traceId);
                    break;
                default:
                    status = 500;
                    error = new ApiError(false, "Une erreur est survenue. Réessayez ou contactez le support.", "INTERNAL_ERROR", null, traceId);
                    _logger.LogError(ex, "Erreur technique non gérée sur {Method} {Path} (trace {TraceId})", context.Request.Method, context.Request.Path, traceId);
                    break;
            }

            context.Response.Clear();
            context.Response.StatusCode = status;
            context.Response.ContentType = "application/json; charset=utf-8";
            await context.Response.WriteAsync(JsonSerializer.Serialize(error, JsonDefaults.Options));
        }
    }
}

public static class JsonDefaults
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };
}

/// <summary>En-têtes de sécurité HTTP appliqués à toutes les réponses de l'API.</summary>
public class SecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;
    public SecurityHeadersMiddleware(RequestDelegate next) => _next = next;

    public Task InvokeAsync(HttpContext context)
    {
        var h = context.Response.Headers;
        h["X-Content-Type-Options"] = "nosniff";
        h["X-Frame-Options"] = "DENY";
        h["Referrer-Policy"] = "no-referrer";
        h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
        h["Cross-Origin-Opener-Policy"] = "same-origin";
        if (!context.Request.Path.StartsWithSegments("/swagger"))
            h["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";
        if (context.Request.Path.StartsWithSegments("/api"))
            h["Cache-Control"] = "no-store";
        return _next(context);
    }
}

/// <summary>Journal technique des requêtes : méthode, chemin, statut, durée, utilisateur.
/// Ne journalise ni corps de requête, ni mot de passe, ni jeton.</summary>
public class RequestLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestLoggingMiddleware> _logger;

    public RequestLoggingMiddleware(RequestDelegate next, ILogger<RequestLoggingMiddleware> logger)
    {
        _next = next; _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var sw = Stopwatch.StartNew();
        try { await _next(context); }
        finally
        {
            sw.Stop();
            if (context.Request.Path.StartsWithSegments("/api"))
            {
                var level = context.Response.StatusCode >= 500 ? LogLevel.Error : context.Response.StatusCode >= 400 ? LogLevel.Warning : LogLevel.Information;
                _logger.Log(level, "HTTP {Method} {Path} → {Status} en {Elapsed} ms (utilisateur {User})",
                    context.Request.Method, context.Request.Path.Value, context.Response.StatusCode, sw.ElapsedMilliseconds,
                    context.User.Identity?.Name ?? "anonyme");
            }
        }
    }
}
