using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Transport.Domain.Entities;
using Transport.Domain.Enums;
using Transport.Infrastructure.Data;

namespace Transport.Tests.Api;

/// <summary>Démarre l'API complète (pipeline, JWT, autorisation, middleware) sur une base InMemory.</summary>
public class ApiFactory : WebApplicationFactory<Program>
{
    private readonly string _db = "api-" + Guid.NewGuid().ToString("N");
    public string StorageRoot { get; } = Path.Combine(Path.GetTempPath(), "tf-api-" + Guid.NewGuid().ToString("N"));

    public ApiFactory()
    {
        // Variables lues dès la construction du host (Program.cs) : on les fixe avant le démarrage.
        Environment.SetEnvironmentVariable("ConnectionStrings__DefaultConnection", "Server=unused;Database=unused");
        Environment.SetEnvironmentVariable("Jwt__Secret", "api-tests-secret-0123456789-abcdefghijkl");
        Environment.SetEnvironmentVariable("SEED_ADMIN_USERNAME", "admin");
        Environment.SetEnvironmentVariable("SEED_ADMIN_PASSWORD", "Test-Admin-Password-2026");
        Environment.SetEnvironmentVariable("Storage__RootPath", StorageRoot);
        Environment.SetEnvironmentVariable("RateLimit__AuthPermitLimit", "1000");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:DefaultConnection", "Server=unused;Database=unused");
        builder.UseSetting("Jwt:Secret", "api-tests-secret-0123456789-abcdefghijkl");
        builder.UseSetting("SEED_ADMIN_USERNAME", "admin");
        builder.UseSetting("SEED_ADMIN_PASSWORD", "Test-Admin-Password-2026");
        builder.UseSetting("Storage:RootPath", StorageRoot);
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
            services.RemoveAll<DbContextOptions>();
            services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(_db));
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        try { Directory.Delete(StorageRoot, true); } catch { /* ignore */ }
    }
}

public class ApiTests : IClassFixture<ApiFactory>
{
    private const string AdminPassword = "Test-Admin-Password-2026";
    private readonly ApiFactory _factory;
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public ApiTests(ApiFactory factory) => _factory = factory;

    private async Task<(HttpClient client, string refresh)> LoginAsync(string user = "admin", string password = AdminPassword, string? audience = "admin")
    {
        var client = _factory.CreateClient();
        var res = await client.PostAsJsonAsync("/api/auth/login", new { username = user, password, audience });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        var data = body.GetProperty("data");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", data.GetProperty("accessToken").GetString());
        return (client, data.GetProperty("refreshToken").GetString()!);
    }

    private async Task<int> SeedClientAndDriverAsync(string code)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        if (await db.Clients.AnyAsync(c => c.Code == code)) return (await db.Clients.FirstAsync(c => c.Code == code)).Id;
        var client = new Client { Code = code, Name = "Client " + code, Country = "France" };
        db.Clients.Add(client);
        await db.SaveChangesAsync();
        return client.Id;
    }

    [Fact]
    public async Task Health_is_public_and_reports_components()
    {
        var res = await _factory.CreateClient().GetAsync("/health");
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("components").TryGetProperty("sqlserver", out _));
        Assert.True(body.GetProperty("components").TryGetProperty("storage", out _));
    }

    [Fact]
    public async Task Protected_endpoints_require_a_jwt()
    {
        var res = await _factory.CreateClient().GetAsync("/api/missions");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(body.GetProperty("success").GetBoolean());
        Assert.Equal("UNAUTHORIZED", body.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Bad_credentials_return_a_consistent_error()
    {
        var res = await _factory.CreateClient().PostAsJsonAsync("/api/auth/login", new { username = "inconnu", password = "x" });
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Identifiants incorrects.", body.GetProperty("message").GetString());
        Assert.Equal("INVALID_CREDENTIALS", body.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Full_mission_workflow_through_the_api()
    {
        var (api, _) = await LoginAsync();
        var clientId = await SeedClientAndDriverAsync("WF");

        // Dashboard
        Assert.Equal(HttpStatusCode.OK, (await api.GetAsync("/api/dashboard")).StatusCode);

        // Chauffeur avec accès mobile
        var drvRes = await api.PostAsJsonAsync("/api/drivers", new
        {
            firstName = "Julie", lastName = "Marchand", email = "julie.wf@test.local", phone = "0623456789", licenseNumber = "WF-LIC-1",
            licenseExpiryDate = DateTime.UtcNow.AddYears(2), createAccount = true, password = "Chauffeur2026!",
        });
        Assert.Equal(HttpStatusCode.OK, drvRes.StatusCode);
        var driverId = (await drvRes.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("data").GetProperty("driver").GetProperty("id").GetInt32();

        // Référence puis mission
        Assert.Equal(HttpStatusCode.OK, (await api.PostAsJsonAsync("/api/references", new { number = "REF-WF-0001", clientId })).StatusCode);
        var create = await api.PostAsJsonAsync("/api/missions", new
        {
            referenceNumber = "REF-WF-0001", clientId, plannedDate = DateTime.UtcNow.AddDays(1),
            pickup = new { address = "1 rue A", city = "Paris" }, delivery = new { address = "2 rue B", city = "Lyon" }, goods = "Palettes",
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var missionId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("data").GetProperty("id").GetInt32();

        // Affectation + statut
        Assert.Equal(HttpStatusCode.OK, (await api.PostAsJsonAsync($"/api/missions/{missionId}/assign", new { driverId })).StatusCode);
        var status = await api.PostAsJsonAsync($"/api/missions/{missionId}/status", new { statusCode = "TO_BE_PICKED_UP" });
        Assert.Equal("TO_BE_PICKED_UP", (await status.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("data").GetProperty("status").GetProperty("code").GetString());

        // Transition interdite → 422 au format standard
        var invalid = await api.PostAsJsonAsync($"/api/missions/{missionId}/status", new { statusCode = "COMPLETED" });
        Assert.Equal((HttpStatusCode)422, invalid.StatusCode);
        Assert.Equal("INVALID_STATUS_TRANSITION", (await invalid.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());

        // Upload multipart/form-data
        var pdf = Encoding.ASCII.GetBytes("%PDF-1.4\n%api\n");
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(pdf);
        file.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        form.Add(file, "file", "CMR.pdf");
        form.Add(new StringContent("2"), "documentTypeId");
        form.Add(new StringContent("CMR signée"), "comment");
        var upload = await api.PostAsync($"/api/missions/{missionId}/documents", form);
        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
        var docId = (await upload.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("data").GetProperty("id").GetInt32();
        Assert.True(Directory.EnumerateFiles(_factory.StorageRoot, "*.pdf", SearchOption.AllDirectories).Any());

        // Téléchargement sécurisé (contenu identique, aucun chemin physique exposé)
        var download = await api.GetAsync($"/api/documents/{docId}/download");
        Assert.Equal(HttpStatusCode.OK, download.StatusCode);
        Assert.Equal(pdf, await download.Content.ReadAsByteArrayAsync());
        var listJson = await (await api.GetAsync($"/api/missions/{missionId}/documents")).Content.ReadAsStringAsync();
        Assert.DoesNotContain("storagePath", listJson, StringComparison.OrdinalIgnoreCase);

        // Historique & audit
        var history = await (await api.GetAsync($"/api/missions/{missionId}/history")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(history.GetProperty("data").GetArrayLength() >= 4);
        var audit = await (await api.GetAsync("/api/history?pageSize=100")).Content.ReadFromJsonAsync<JsonElement>();
        var actions = audit.GetProperty("data").GetProperty("items").EnumerateArray().Select(i => i.GetProperty("action").GetString()).ToList();
        Assert.Contains("LOGIN", actions);
        Assert.Contains("ASSIGN", actions);
        Assert.Contains("STATUS_CHANGE", actions);
        Assert.Contains("DOCUMENT_UPLOAD", actions);

        // Suppression logique du document
        Assert.Equal(HttpStatusCode.OK, (await api.DeleteAsync($"/api/documents/{docId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await api.GetAsync($"/api/documents/{docId}/download")).StatusCode);

        // Le chauffeur se connecte (API mobile) mais n'accède pas à l'administration
        var driverClient = _factory.CreateClient();
        var driverLogin = await driverClient.PostAsJsonAsync("/api/auth/login", new { username = "julie.wf@test.local", password = "Chauffeur2026!" });
        var token = (await driverLogin.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("data").GetProperty("accessToken").GetString();
        driverClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        Assert.Equal(HttpStatusCode.Forbidden, (await driverClient.GetAsync("/api/users")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await driverClient.PostAsJsonAsync("/api/missions", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await driverClient.GetAsync("/api/driver/missions/by-reference/REF-WF-0001")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await driverClient.PostAsJsonAsync($"/api/driver/missions/{missionId}/status", new { statusCode = "PICKED_UP", comment = "Chargé" })).StatusCode);
    }

    [Fact]
    public async Task Driver_cannot_log_into_the_admin_space()
    {
        var (api, _) = await LoginAsync();
        await api.PostAsJsonAsync("/api/users", new { username = "drv.only", email = "drv.only@test.local", firstName = "D", lastName = "R", role = "DRIVER", password = "Chauffeur2026!" });
        var res = await _factory.CreateClient().PostAsJsonAsync("/api/auth/login", new { username = "drv.only", password = "Chauffeur2026!", audience = "admin" });
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }

    [Fact]
    public async Task Logout_revokes_the_access_token()
    {
        var (api, refresh) = await LoginAsync();
        Assert.Equal(HttpStatusCode.OK, (await api.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await api.PostAsync("/api/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.GetAsync("/api/auth/me")).StatusCode);
        var again = await _factory.CreateClient().PostAsJsonAsync("/api/auth/refresh", new { refreshToken = refresh });
        Assert.Equal(HttpStatusCode.Unauthorized, again.StatusCode);
    }

    [Fact]
    public async Task Validation_errors_use_the_standard_envelope()
    {
        var (api, _) = await LoginAsync();
        var res = await api.PostAsJsonAsync("/api/missions", new { referenceNumber = "", clientId = 0 });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("VALIDATION_ERROR", body.GetProperty("code").GetString());
        Assert.True(body.GetProperty("errors").TryGetProperty("referenceNumber", out _));
    }
}
