using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Transport.Application.Clients;
using Transport.Application.Drivers;
using Transport.Application.References;
using Transport.Application.Search;
using Transport.Application.Vehicles;

namespace Transport.Api.Controllers;

[Route("api/references")]
[Authorize(Policy = Policies.Admin)]
public class ReferencesController : ApiControllerBase
{
    private const long MaxImportBytes = 5 * 1024 * 1024;
    private readonly IReferenceService _references;
    private readonly IExportService _export;

    public ReferencesController(IReferenceService references, IExportService export)
    {
        _references = references; _export = export;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] ReferenceQuery q, CancellationToken ct) => Success(await _references.ListAsync(q, ct));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id, CancellationToken ct) => Success(await _references.GetAsync(id, ct));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] ReferenceUpsertRequest r, CancellationToken ct) =>
        Success(await _references.CreateAsync(r, ct), "Référence créée avec succès.");

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] ReferenceUpsertRequest r, CancellationToken ct) =>
        Success(await _references.UpdateAsync(id, r, ct), "Référence modifiée avec succès.");

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await _references.DeleteAsync(id, ct);
        return Success("Référence supprimée.");
    }

    /// <summary>Import CSV/XLSX. commit=false : analyse et prévisualisation ; commit=true : enregistre les lignes valides.</summary>
    [HttpPost("import")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(MaxImportBytes + 1024 * 1024)]
    public async Task<IActionResult> Import(IFormFile? file, [FromQuery] bool commit = false, CancellationToken ct = default)
    {
        if (file is null || file.Length == 0)
            throw new Application.Common.ValidationAppException(new Dictionary<string, string[]> { ["file"] = new[] { "Sélectionnez un fichier CSV ou Excel." } });
        if (file.Length > MaxImportBytes)
            throw new Application.Common.ValidationAppException(new Dictionary<string, string[]> { ["file"] = new[] { "Le fichier dépasse 5 Mo." } });
        await using var stream = file.OpenReadStream();
        var result = await _references.ImportAsync(stream, file.FileName, commit, ct);
        return Success(result, commit ? "Référence(s) importée(s) avec succès." : null);
    }

    /// <summary>Modèle CSV d'import.</summary>
    [HttpGet("import-template")]
    public IActionResult Template()
    {
        var csv = "﻿Reference;Client;Notes\r\nREF-2026-01001;ABC;Livraison quai 3\r\nREF-2026-01002;Nordis Distribution;\r\n";
        return FileResult(System.Text.Encoding.UTF8.GetBytes(csv), "text/csv; charset=utf-8", "modele-import-references.csv");
    }

    [HttpGet("export")]
    public async Task<IActionResult> Export([FromQuery] ReferenceQuery q, [FromQuery] string format = "csv", CancellationToken ct = default)
    {
        var file = await _export.ExportReferencesAsync(q, format, ct);
        return FileResult(file.Content, file.ContentType, file.FileName);
    }
}

[Route("api/drivers")]
[Authorize(Policy = Policies.Admin)]
public class DriversController : ApiControllerBase
{
    private readonly IDriverService _drivers;
    private readonly IExportService _export;

    public DriversController(IDriverService drivers, IExportService export)
    {
        _drivers = drivers; _export = export;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] DriverQuery q, CancellationToken ct) => Success(await _drivers.ListAsync(q, ct));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id, CancellationToken ct) => Success(await _drivers.GetAsync(id, ct));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] DriverUpsertRequest r, CancellationToken ct) =>
        Success(await _drivers.CreateAsync(r, ct), "Chauffeur créé avec succès.");

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] DriverUpsertRequest r, CancellationToken ct) =>
        Success(await _drivers.UpdateAsync(id, r, ct), "Chauffeur modifié avec succès.");

    [HttpPatch("{id:int}/status")]
    public async Task<IActionResult> SetStatus(int id, [FromBody] SetActiveRequest r, CancellationToken ct) =>
        Success(await _drivers.SetActiveAsync(id, r.IsActive, ct), r.IsActive ? "Chauffeur activé." : "Chauffeur désactivé.");

    [HttpGet("export")]
    public async Task<IActionResult> Export([FromQuery] DriverQuery q, [FromQuery] string format = "csv", CancellationToken ct = default)
    {
        var file = await _export.ExportDriversAsync(q, format, ct);
        return FileResult(file.Content, file.ContentType, file.FileName);
    }
}

[Route("api/clients")]
[Authorize(Policy = Policies.Admin)]
public class ClientsController : ApiControllerBase
{
    private readonly IClientService _clients;
    public ClientsController(IClientService clients) => _clients = clients;

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] ClientQuery q, CancellationToken ct) => Success(await _clients.ListAsync(q, ct));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id, CancellationToken ct) => Success(await _clients.GetAsync(id, ct));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] ClientUpsertRequest r, CancellationToken ct) =>
        Success(await _clients.CreateAsync(r, ct), "Client créé avec succès.");

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] ClientUpsertRequest r, CancellationToken ct) =>
        Success(await _clients.UpdateAsync(id, r, ct), "Client modifié avec succès.");

    [HttpPatch("{id:int}/status")]
    public async Task<IActionResult> SetStatus(int id, [FromBody] SetActiveRequest r, CancellationToken ct) =>
        Success(await _clients.SetActiveAsync(id, r.IsActive, ct), r.IsActive ? "Client activé." : "Client désactivé.");
}

[Route("api/vehicles")]
[Authorize(Policy = Policies.Admin)]
public class VehiclesController : ApiControllerBase
{
    private readonly IVehicleService _vehicles;
    public VehiclesController(IVehicleService vehicles) => _vehicles = vehicles;

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] VehicleQuery q, CancellationToken ct) => Success(await _vehicles.ListAsync(q, ct));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id, CancellationToken ct) => Success(await _vehicles.GetAsync(id, ct));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] VehicleUpsertRequest r, CancellationToken ct) =>
        Success(await _vehicles.CreateAsync(r, ct), "Véhicule créé avec succès.");

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] VehicleUpsertRequest r, CancellationToken ct) =>
        Success(await _vehicles.UpdateAsync(id, r, ct), "Véhicule modifié avec succès.");

    [HttpPatch("{id:int}/status")]
    public async Task<IActionResult> SetStatus(int id, [FromBody] VehicleStatusRequest r, CancellationToken ct) =>
        Success(await _vehicles.SetStatusAsync(id, r.Status, ct), "Statut du véhicule mis à jour.");
}
