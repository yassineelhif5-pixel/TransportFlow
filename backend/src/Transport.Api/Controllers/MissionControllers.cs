using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Transport.Application.Dashboard;
using Transport.Application.Documents;
using Transport.Application.Missions;
using Transport.Application.Search;

namespace Transport.Api.Controllers;

/// <summary>Statistiques calculées par SQL Server.</summary>
[Route("api/dashboard")]
[Authorize(Policy = Policies.Admin)]
public class DashboardController : ApiControllerBase
{
    private readonly IDashboardService _dashboard;
    public DashboardController(IDashboardService dashboard) => _dashboard = dashboard;

    /// <summary>Vue complète du tableau de bord (KPI, répartitions, tendance, actions requises, activité).</summary>
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct) => Success(await _dashboard.GetAsync(ct));

    [HttpGet("kpis")]
    public async Task<IActionResult> Kpis(CancellationToken ct) => Success(await _dashboard.GetKpisAsync(ct));

    [HttpGet("missions-by-status")]
    public async Task<IActionResult> ByStatus(CancellationToken ct) => Success(await _dashboard.GetByStatusAsync(ct));

    [HttpGet("missions-by-driver")]
    public async Task<IActionResult> ByDriver([FromQuery] int top = 10, CancellationToken ct = default) => Success(await _dashboard.GetByDriverAsync(Math.Clamp(top, 1, 50), ct));

    [HttpGet("missions-by-client")]
    public async Task<IActionResult> ByClient([FromQuery] int top = 10, CancellationToken ct = default) => Success(await _dashboard.GetByClientAsync(Math.Clamp(top, 1, 50), ct));

    [HttpGet("recent-activity")]
    public async Task<IActionResult> Activity([FromQuery] int take = 20, CancellationToken ct = default) => Success(await _dashboard.GetRecentActivityAsync(Math.Clamp(take, 1, 100), ct));
}

[Route("api/missions")]
[Authorize(Policy = Policies.Admin)]
public class MissionsController : ApiControllerBase
{
    private readonly IMissionService _missions;
    private readonly IDocumentService _documents;
    private readonly IExportService _export;

    public MissionsController(IMissionService missions, IDocumentService documents, IExportService export)
    {
        _missions = missions; _documents = documents; _export = export;
    }

    /// <summary>Liste paginée, filtrable (statut, client, chauffeur, période) et triable.</summary>
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] MissionQuery q, CancellationToken ct) => Success(await _missions.ListAsync(q, ct));

    [HttpGet("statuses")]
    public async Task<IActionResult> Statuses(CancellationToken ct) => Success(await _missions.GetStatusesAsync(ct));

    [HttpGet("export")]
    public async Task<IActionResult> Export([FromQuery] MissionQuery q, [FromQuery] string format = "csv", CancellationToken ct = default)
    {
        var file = await _export.ExportMissionsAsync(q, format, ct);
        return FileResult(file.Content, file.ContentType, file.FileName);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id, CancellationToken ct) => Success(await _missions.GetAsync(id, ct));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] MissionUpsertRequest request, CancellationToken ct)
    {
        var mission = await _missions.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = mission.Id }, Application.Common.ApiResponse.Ok(mission, "Mission créée avec succès."));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] MissionUpsertRequest request, CancellationToken ct) =>
        Success(await _missions.UpdateAsync(id, request, ct), "Mission modifiée avec succès.");

    /// <summary>Suppression logique (missions créées ou annulées uniquement).</summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await _missions.DeleteAsync(id, ct);
        return Success("Mission supprimée.");
    }

    /// <summary>Affecte (ou réaffecte) un chauffeur et un véhicule. L'affectation précédente est conservée en historique.</summary>
    [HttpPost("{id:int}/assign")]
    public async Task<IActionResult> Assign(int id, [FromBody] AssignMissionRequest request, CancellationToken ct) =>
        Success(await _missions.AssignAsync(id, request, ct), "Mission affectée avec succès.");

    /// <summary>Change le statut (MissionStatusHistory + AuditLog + notifications).</summary>
    [HttpPost("{id:int}/status")]
    public async Task<IActionResult> ChangeStatus(int id, [FromBody] ChangeStatusRequest request, CancellationToken ct) =>
        Success(await _missions.ChangeStatusAsync(id, request, ct), "Statut mis à jour.");

    [HttpGet("{id:int}/history")]
    public async Task<IActionResult> History(int id, CancellationToken ct) => Success(await _missions.GetTimelineAsync(id, ct));

    [HttpGet("{id:int}/documents")]
    public async Task<IActionResult> Documents(int id, CancellationToken ct) => Success(await _documents.ListForMissionAsync(id, ct));

    /// <summary>Upload multipart/form-data : file, documentTypeId, comment.</summary>
    [HttpPost("{id:int}/documents")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> Upload(int id, [FromForm] DocumentUploadForm form, CancellationToken ct)
    {
        if (form.File is null)
            throw new Application.Common.ValidationAppException(new Dictionary<string, string[]> { ["file"] = new[] { "Sélectionnez un fichier." } });
        await using var stream = form.File.OpenReadStream();
        var doc = await _documents.UploadAsync(new UploadDocumentCommand(id, form.DocumentTypeId, form.Comment, form.File.FileName, form.File.ContentType, form.File.Length, stream), ct);
        return Success(doc, "Document ajouté avec succès.");
    }
}

public class DocumentUploadForm
{
    public IFormFile? File { get; set; }
    public int DocumentTypeId { get; set; }
    public string? Comment { get; set; }
}

[Route("api/documents")]
[Authorize(Policy = Policies.Admin)]
public class DocumentsController : ApiControllerBase
{
    private readonly IDocumentService _documents;
    public DocumentsController(IDocumentService documents) => _documents = documents;

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] DocumentQuery q, CancellationToken ct) => Success(await _documents.ListAsync(q, ct));

    [HttpGet("types")]
    public async Task<IActionResult> Types(CancellationToken ct) => Success(await _documents.GetTypesAsync(ct));

    /// <summary>Téléchargement sécurisé : le chemin physique n'est jamais exposé.</summary>
    [HttpGet("{id:int}/download")]
    [Produces("application/octet-stream")]
    public async Task<IActionResult> Download(int id, [FromQuery] bool inline = false, CancellationToken ct = default)
    {
        var doc = await _documents.DownloadAsync(id, ct);
        if (inline)
        {
            Response.Headers.ContentDisposition = $"inline; filename*=UTF-8''{Uri.EscapeDataString(doc.FileName)}";
            Response.Headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self' data: blob:; style-src 'unsafe-inline'; plugin-types application/pdf; sandbox";
            return File(doc.Content, doc.MimeType);
        }
        return File(doc.Content, doc.MimeType, doc.FileName);
    }

    /// <summary>Suppression logique : la trace métier et le fichier sont conservés (IsDeleted = true).</summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await _documents.DeleteAsync(id, ct);
        return Success("Document supprimé.");
    }
}

[Route("api/search")]
[Authorize(Policy = Policies.Admin)]
public class SearchController : ApiControllerBase
{
    private readonly ISearchService _search;
    public SearchController(ISearchService search) => _search = search;

    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] string q, CancellationToken ct) => Success(await _search.SearchAsync(q, ct));
}
