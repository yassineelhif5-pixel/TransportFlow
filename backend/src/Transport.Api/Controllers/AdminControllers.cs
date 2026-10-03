using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Transport.Application.Common;
using Transport.Application.Documents;
using Transport.Application.Drivers;
using Transport.Application.History;
using Transport.Application.Interfaces;
using Transport.Application.Missions;
using Transport.Application.Notifications;
using Transport.Application.Search;
using Transport.Application.Users;

namespace Transport.Api.Controllers;

/// <summary>Journal d'audit métier (lecture seule).</summary>
[Route("api/history")]
[Authorize(Policy = Policies.Admin)]
public class HistoryController : ApiControllerBase
{
    private readonly IHistoryService _history;
    private readonly IExportService _export;

    public HistoryController(IHistoryService history, IExportService export)
    {
        _history = history; _export = export;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] HistoryQuery q, CancellationToken ct) => Success(await _history.ListAsync(q, ct));

    [HttpGet("filters")]
    public async Task<IActionResult> Filters(CancellationToken ct) => Success(await _history.GetFiltersAsync(ct));

    [HttpGet("export")]
    public async Task<IActionResult> Export([FromQuery] HistoryQuery q, [FromQuery] string format = "csv", CancellationToken ct = default)
    {
        var file = await _export.ExportHistoryAsync(q, format, ct);
        return FileResult(file.Content, file.ContentType, file.FileName);
    }
}

/// <summary>Notifications de l'utilisateur connecté (admin ou chauffeur).</summary>
[Route("api/notifications")]
[Authorize(Policy = Policies.AdminOrDriver)]
public class NotificationsController : ApiControllerBase
{
    private readonly IUserNotificationService _notifications;
    public NotificationsController(IUserNotificationService notifications) => _notifications = notifications;

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] NotificationQuery q, CancellationToken ct) => Success(await _notifications.ListAsync(q, ct));

    [HttpGet("unread-count")]
    public async Task<IActionResult> UnreadCount(CancellationToken ct) => Success(await _notifications.UnreadCountAsync(ct));

    [HttpPost("{id:int}/read")]
    public async Task<IActionResult> MarkRead(int id, CancellationToken ct)
    {
        await _notifications.MarkReadAsync(id, ct);
        return Success("Notification marquée comme lue.");
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllRead(CancellationToken ct) =>
        Success(await _notifications.MarkAllReadAsync(ct), "Toutes les notifications sont lues.");
}

[Route("api/users")]
[Authorize(Policy = Policies.Admin)]
public class UsersController : ApiControllerBase
{
    private readonly IUserService _users;
    public UsersController(IUserService users) => _users = users;

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] UserQuery q, CancellationToken ct) => Success(await _users.ListAsync(q, ct));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id, CancellationToken ct) => Success(await _users.GetAsync(id, ct));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UserCreateRequest r, CancellationToken ct) =>
        Success(await _users.CreateAsync(r, ct), "Utilisateur créé avec succès.");

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] UserUpdateRequest r, CancellationToken ct) =>
        Success(await _users.UpdateAsync(id, r, ct), "Utilisateur modifié avec succès.");

    [HttpPatch("{id:int}/status")]
    public async Task<IActionResult> SetStatus(int id, [FromBody] SetActiveRequest r, CancellationToken ct) =>
        Success(await _users.SetActiveAsync(id, r.IsActive, ct), r.IsActive ? "Utilisateur activé." : "Utilisateur désactivé.");

    /// <summary>Génère un mot de passe temporaire (affiché une seule fois) et force son changement.</summary>
    [HttpPost("{id:int}/reset-password")]
    public async Task<IActionResult> ResetPassword(int id, CancellationToken ct) =>
        Success(await _users.ResetPasswordAsync(id, ct), "Mot de passe réinitialisé.");
}

[Route("api/settings")]
[Authorize(Policy = Policies.Admin)]
public class SettingsController : ApiControllerBase
{
    private readonly ISettingsService _settings;
    public SettingsController(ISettingsService settings) => _settings = settings;

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct) => Success(await _settings.ListAsync(ct));

    [HttpPut]
    public async Task<IActionResult> Update([FromBody] List<SystemParameterUpdate> updates, CancellationToken ct) =>
        Success(await _settings.UpdateAsync(updates, ct), "Paramètres enregistrés.");
}

/// <summary>API dédiée à la future application Mobile Chauffeur. Un chauffeur ne voit que ses propres missions.</summary>
[Route("api/driver")]
[Authorize(Policy = Policies.Driver)]
public class DriverAppController : ApiControllerBase
{
    private readonly IMissionService _missions;
    private readonly IDocumentService _documents;
    private readonly IDriverService _drivers;
    private readonly ICurrentUserService _current;

    public DriverAppController(IMissionService missions, IDocumentService documents, IDriverService drivers, ICurrentUserService current)
    {
        _missions = missions; _documents = documents; _drivers = drivers; _current = current;
    }

    private async Task<int> DriverIdAsync(CancellationToken ct) =>
        await _drivers.GetDriverIdForUserAsync(_current.RequireUserId(), ct)
        ?? throw new ForbiddenException("Aucune fiche chauffeur active n'est liée à ce compte.");

    /// <summary>Missions affectées au chauffeur connecté.</summary>
    [HttpGet("missions")]
    public async Task<IActionResult> MyMissions([FromQuery] MissionQuery q, CancellationToken ct) =>
        Success(await _missions.ListAsync(q, ct, await DriverIdAsync(ct)));

    /// <summary>Recherche d'une mission par référence saisie ou scannée (QR code).</summary>
    [HttpGet("missions/by-reference/{reference}")]
    public async Task<IActionResult> ByReference(string reference, CancellationToken ct) =>
        Success(await _missions.FindByReferenceAsync(reference, ct, await DriverIdAsync(ct))
                ?? throw new NotFoundException("MISSION_NOT_FOUND", "Aucune mission ne correspond à cette référence."));

    [HttpGet("missions/{id:int}")]
    public async Task<IActionResult> Get(int id, CancellationToken ct) => Success(await _missions.GetAsync(id, ct, await DriverIdAsync(ct)));

    [HttpGet("missions/{id:int}/history")]
    public async Task<IActionResult> History(int id, CancellationToken ct) => Success(await _missions.GetTimelineAsync(id, ct, await DriverIdAsync(ct)));

    /// <summary>Prise en charge, en cours, terminée, anomalie (+ commentaire et position GPS optionnels).</summary>
    [HttpPost("missions/{id:int}/status")]
    public async Task<IActionResult> ChangeStatus(int id, [FromBody] ChangeStatusRequest r, CancellationToken ct)
    {
        if (r.StatusCode is Domain.Enums.MissionStatusCodes.Cancelled)
            throw new ForbiddenException("Seul un administrateur peut annuler une mission.");
        return Success(await _missions.ChangeStatusAsync(id, r, ct, await DriverIdAsync(ct)), "Statut mis à jour.");
    }

    [HttpGet("missions/{id:int}/documents")]
    public async Task<IActionResult> Documents(int id, CancellationToken ct) => Success(await _documents.ListForMissionAsync(id, ct, await DriverIdAsync(ct)));

    /// <summary>Photo ou document (CMR, preuve de livraison…) depuis le téléphone.</summary>
    [HttpPost("missions/{id:int}/documents")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> Upload(int id, [FromForm] DocumentUploadForm form, CancellationToken ct)
    {
        if (form.File is null)
            throw new ValidationAppException(new Dictionary<string, string[]> { ["file"] = new[] { "Sélectionnez un fichier." } });
        var driverId = await DriverIdAsync(ct);
        await using var stream = form.File.OpenReadStream();
        return Success(await _documents.UploadAsync(new UploadDocumentCommand(id, form.DocumentTypeId, form.Comment, form.File.FileName, form.File.ContentType, form.File.Length, stream), ct, driverId),
            "Document ajouté avec succès.");
    }

    [HttpGet("documents/{id:int}/download")]
    public async Task<IActionResult> Download(int id, CancellationToken ct)
    {
        var doc = await _documents.DownloadAsync(id, ct, await DriverIdAsync(ct));
        return File(doc.Content, doc.MimeType, doc.FileName);
    }
}
