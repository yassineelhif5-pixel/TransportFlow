using System.Text;
using Microsoft.EntityFrameworkCore;
using Transport.Application.Auth;
using Transport.Application.Common;
using Transport.Application.Documents;
using Transport.Application.Missions;
using Transport.Domain.Enums;

namespace Transport.Tests.Integration;

public class AuthServiceTests
{
    [Fact]
    public async Task Admin_can_log_in_with_development_credentials()
    {
        await using var t = await TestContext.CreateAsync();
        var res = await t.Auth().LoginAsync(new LoginRequest("admin", "admin", false, "admin"), default);

        Assert.False(string.IsNullOrEmpty(res.AccessToken));
        Assert.Equal(RoleCodes.Admin, res.User.Role);
        var admin = await t.Db.Users.FirstAsync(u => u.Username == "admin");
        Assert.NotEqual("admin", admin.PasswordHash);                       // jamais en clair
        Assert.NotNull(admin.RefreshTokenHash);
        Assert.NotEqual(res.RefreshToken, admin.RefreshTokenHash);          // refresh token haché
        Assert.Contains(await t.Db.AuditLogs.ToListAsync(), a => a.Action == AuditActions.Login);
    }

    [Fact]
    public async Task Wrong_password_is_rejected_and_account_locks_after_five_failures()
    {
        await using var t = await TestContext.CreateAsync();
        var auth = t.Auth();
        for (var i = 0; i < AuthService.MaxFailedAttempts; i++)
        {
            var ex = await Assert.ThrowsAsync<UnauthorizedAppException>(() => auth.LoginAsync(new LoginRequest("admin", "mauvais"), default));
            Assert.Equal("Identifiants incorrects.", ex.Message);
        }
        var locked = await Assert.ThrowsAsync<AppException>(() => auth.LoginAsync(new LoginRequest("admin", "admin"), default));
        Assert.Equal("ACCOUNT_LOCKED", locked.Code);
    }

    [Fact]
    public async Task Driver_cannot_open_the_admin_space_and_disabled_account_is_refused()
    {
        await using var t = await TestContext.CreateAsync();
        var driver = await t.AddDriverAsync();
        var ex = await Assert.ThrowsAsync<AppException>(() => t.Auth().LoginAsync(new LoginRequest(driver.User!.Username, "Chauffeur2026!", false, "admin"), default));
        Assert.Equal("ADMIN_ONLY", ex.Code);

        driver.User.IsActive = false;
        await t.Db.SaveChangesAsync();
        var disabled = await Assert.ThrowsAsync<AppException>(() => t.Auth().LoginAsync(new LoginRequest(driver.User.Username, "Chauffeur2026!"), default));
        Assert.Equal("ACCOUNT_DISABLED", disabled.Code);
    }

    [Fact]
    public async Task Refresh_rotates_token_and_logout_revokes_it()
    {
        await using var t = await TestContext.CreateAsync();
        var login = await t.Auth().LoginAsync(new LoginRequest("admin", "admin"), default);
        var refreshed = await t.Auth().RefreshAsync(new RefreshRequest(login.RefreshToken), default);
        Assert.NotEqual(login.RefreshToken, refreshed.RefreshToken);
        await Assert.ThrowsAsync<UnauthorizedAppException>(() => t.Auth().RefreshAsync(new RefreshRequest(login.RefreshToken), default));

        await t.Auth().LogoutAsync(default);
        await Assert.ThrowsAsync<UnauthorizedAppException>(() => t.Auth().RefreshAsync(new RefreshRequest(refreshed.RefreshToken), default));
    }

    [Fact]
    public async Task Change_password_enforces_policy()
    {
        await using var t = await TestContext.CreateAsync();
        await Assert.ThrowsAsync<ValidationAppException>(() => t.Auth().ChangePasswordAsync(new ChangePasswordRequest("admin", "faible", "faible"), default));
        await Assert.ThrowsAsync<ValidationAppException>(() => t.Auth().ChangePasswordAsync(new ChangePasswordRequest("faux", "Nouveau2026!", "Nouveau2026!"), default));
        var res = await t.Auth().ChangePasswordAsync(new ChangePasswordRequest("admin", "Nouveau2026!", "Nouveau2026!"), default);
        Assert.False(res.User.MustChangePassword);
        await t.Auth().LoginAsync(new LoginRequest("admin", "Nouveau2026!"), default);
    }
}

public class MissionServiceTests
{
    [Fact]
    public async Task Create_mission_creates_reference_history_and_audit()
    {
        await using var t = await TestContext.CreateAsync();
        var client = await t.AddClientAsync();
        var mission = await t.Missions().CreateAsync(TestContext.NewMission(client.Id), default);

        Assert.Equal("REF-2026-00125", mission.ReferenceNumber);
        Assert.Equal(MissionStatusCodes.Created, mission.Status.Code);
        Assert.Equal(ReferenceStatuses.Used, (await t.Db.References.SingleAsync()).Status);
        Assert.Single(await t.Db.MissionStatusHistories.ToListAsync());
        Assert.Contains(await t.Db.AuditLogs.ToListAsync(), a => a.EntityName == "Mission" && a.Action == AuditActions.Create);
    }

    [Fact]
    public async Task A_reference_cannot_be_used_by_two_missions_and_inactive_client_is_refused()
    {
        await using var t = await TestContext.CreateAsync();
        var client = await t.AddClientAsync();
        await t.Missions().CreateAsync(TestContext.NewMission(client.Id), default);
        var dup = await Assert.ThrowsAsync<ConflictException>(() => t.Missions().CreateAsync(TestContext.NewMission(client.Id), default));
        Assert.Equal("REFERENCE_ALREADY_USED", dup.Code);

        var inactive = await t.AddClientAsync("OFF", "Inactif", active: false);
        var ex = await Assert.ThrowsAsync<BusinessRuleException>(() => t.Missions().CreateAsync(TestContext.NewMission(inactive.Id, "REF-X-1"), default));
        Assert.Equal("CLIENT_INACTIVE", ex.Code);
    }

    [Fact]
    public async Task Invalid_payload_returns_field_errors()
    {
        await using var t = await TestContext.CreateAsync();
        var bad = TestContext.NewMission(0, "") with { WeightKg = -5 };
        var ex = await Assert.ThrowsAsync<ValidationAppException>(() => t.Missions().CreateAsync(bad, default));
        Assert.True(ex.Errors!.ContainsKey("referenceNumber"));
        Assert.True(ex.Errors.ContainsKey("clientId"));
        Assert.True(ex.Errors.ContainsKey("weightKg"));
    }

    [Fact]
    public async Task Assignment_rules_and_history_are_enforced()
    {
        await using var t = await TestContext.CreateAsync();
        var client = await t.AddClientAsync();
        var svc = t.Missions();
        var m = await svc.CreateAsync(TestContext.NewMission(client.Id), default);

        var inactive = await t.AddDriverAsync(active: false, license: "OFF1");
        Assert.Equal("DRIVER_INACTIVE", (await Assert.ThrowsAsync<BusinessRuleException>(() => svc.AssignAsync(m.Id, new AssignMissionRequest(inactive.Id, null, null), default))).Code);
        var noUser = await t.AddDriverAsync(withUser: false, license: "NOU1");
        Assert.Equal("DRIVER_NO_ACTIVE_USER", (await Assert.ThrowsAsync<BusinessRuleException>(() => svc.AssignAsync(m.Id, new AssignMissionRequest(noUser.Id, null, null), default))).Code);
        var expired = await t.AddDriverAsync(licenseDays: -1, license: "EXP1");
        Assert.Equal("DRIVER_LICENSE_EXPIRED", (await Assert.ThrowsAsync<BusinessRuleException>(() => svc.AssignAsync(m.Id, new AssignMissionRequest(expired.Id, null, null), default))).Code);

        var d1 = await t.AddDriverAsync(license: "OK1");
        var d2 = await t.AddDriverAsync(license: "OK2");
        var assigned = await svc.AssignAsync(m.Id, new AssignMissionRequest(d1.Id, null, "Quai 3"), default);
        Assert.Equal(MissionStatusCodes.Assigned, assigned.Status.Code);
        var reassigned = await svc.AssignAsync(m.Id, new AssignMissionRequest(d2.Id, null, null), default);

        Assert.Equal(d2.Id, reassigned.Driver!.Id);
        var assignments = await t.Db.MissionAssignments.Where(a => a.MissionId == m.Id).ToListAsync();
        Assert.Equal(2, assignments.Count);                                      // historique conservé
        Assert.Single(assignments, a => a.Status == AssignmentStatuses.Active);
        Assert.Contains(await t.Db.AuditLogs.ToListAsync(), a => a.Action == AuditActions.Unassign);
        Assert.NotEmpty(await t.Db.Notifications.ToListAsync());
    }

    [Fact]
    public async Task Status_changes_follow_lifecycle_and_lock_completed_missions()
    {
        await using var t = await TestContext.CreateAsync();
        var client = await t.AddClientAsync();
        var driver = await t.AddDriverAsync();
        var svc = t.Missions();
        var m = await svc.CreateAsync(TestContext.NewMission(client.Id, driverId: driver.Id), default);
        Assert.Equal(MissionStatusCodes.Assigned, m.Status.Code); // « Enregistrer et affecter »

        await Assert.ThrowsAsync<BusinessRuleException>(() => svc.ChangeStatusAsync(m.Id, new ChangeStatusRequest(MissionStatusCodes.Completed, null), default));
        await Assert.ThrowsAsync<ValidationAppException>(() => svc.ChangeStatusAsync(m.Id, new ChangeStatusRequest(MissionStatusCodes.Anomaly, null), default));

        foreach (var s in new[] { MissionStatusCodes.ToBePickedUp, MissionStatusCodes.PickedUp, MissionStatusCodes.InProgress, MissionStatusCodes.Completed })
            m = await svc.ChangeStatusAsync(m.Id, new ChangeStatusRequest(s, null), default);

        Assert.True(m.IsLocked);
        Assert.Equal(6, await t.Db.MissionStatusHistories.CountAsync(h => h.MissionId == m.Id));
        Assert.Equal(4, await t.Db.AuditLogs.CountAsync(a => a.Action == AuditActions.StatusChange));
        var locked = await Assert.ThrowsAsync<BusinessRuleException>(() => svc.UpdateAsync(m.Id, TestContext.NewMission(client.Id), default));
        Assert.Equal("MISSION_LOCKED", locked.Code);
        Assert.Equal(AssignmentStatuses.Ended, (await t.Db.MissionAssignments.SingleAsync()).Status);

        var timeline = await svc.GetTimelineAsync(m.Id, default);
        Assert.Contains(timeline, i => i.Type == "ASSIGN");
        Assert.Contains(timeline, i => i.Type == "CREATE");
    }

    [Fact]
    public async Task Driver_scope_hides_other_missions()
    {
        await using var t = await TestContext.CreateAsync();
        var client = await t.AddClientAsync();
        var d1 = await t.AddDriverAsync(license: "D1");
        var d2 = await t.AddDriverAsync(license: "D2");
        var m = await t.Missions().CreateAsync(TestContext.NewMission(client.Id, driverId: d1.Id), default);

        await Assert.ThrowsAsync<NotFoundException>(() => t.Missions().GetAsync(m.Id, default, restrictToDriverId: d2.Id));
        Assert.NotNull(await t.Missions().FindByReferenceAsync("REF-2026-00125", default, d1.Id));
        Assert.Equal(0, (await t.Missions().ListAsync(new MissionQuery(), default, d2.Id)).Total);
    }

    [Fact]
    public async Task Update_is_audited_with_old_and_new_values()
    {
        await using var t = await TestContext.CreateAsync();
        var client = await t.AddClientAsync();
        var m = await t.Missions().CreateAsync(TestContext.NewMission(client.Id), default);
        await t.Missions().UpdateAsync(m.Id, TestContext.NewMission(client.Id) with { Goods = "Médicaments" }, default);
        var audit = await t.Db.AuditLogs.SingleAsync(a => a.Action == AuditActions.Update && a.EntityName == "Mission");
        Assert.Contains("Produits secs", audit.OldValue);
        Assert.Contains("Médicaments", audit.NewValue);
        Assert.Equal("127.0.0.1", audit.IpAddress);
    }
}

public class ReferenceImportTests
{
    [Fact]
    public async Task Import_previews_then_commits_only_valid_rows()
    {
        await using var t = await TestContext.CreateAsync();
        await t.AddClientAsync("ABC", "ABC Logistics");
        await t.References().CreateAsync(new Application.References.ReferenceUpsertRequest("REF-EXIST", (await t.Db.Clients.FirstAsync()).Id, null), default);

        var csv = "Référence;Client;Notes\nREF-A;ABC;ok\n;ABC;\nREF-B;Inconnu;\nREF-EXIST;ABC;\nREF-A;ABC;doublon\nREF-C;abc logistics;\n";
        var preview = await t.References().ImportAsync(new MemoryStream(Encoding.UTF8.GetBytes(csv)), "planning.csv", false, default);

        Assert.Equal(6, preview.TotalRows);
        Assert.Equal(2, preview.ValidRows);
        Assert.Equal(4, preview.ErrorRows);
        Assert.Contains(preview.Errors, e => e.Line == 3 && e.Message == "Référence obligatoire");
        Assert.Contains(preview.Errors, e => e.Line == 4 && e.Message == "Client introuvable");
        Assert.Contains(preview.Errors, e => e.Line == 5 && e.Message == "Référence déjà existante");
        Assert.Equal(1, await t.Db.References.CountAsync()); // rien n'est écrit en prévisualisation

        var committed = await t.References().ImportAsync(new MemoryStream(Encoding.UTF8.GetBytes(csv)), "planning.csv", true, default);
        Assert.Equal(2, committed.Imported);
        Assert.Equal(3, await t.Db.References.CountAsync());
        Assert.Contains(await t.Db.AuditLogs.ToListAsync(), a => a.Action == AuditActions.Import);
    }

    [Fact]
    public async Task Import_rejects_unsupported_files_and_missing_columns()
    {
        await using var t = await TestContext.CreateAsync();
        Assert.Equal("IMPORT_INVALID_FORMAT", (await Assert.ThrowsAsync<AppException>(() => t.References().ImportAsync(new MemoryStream(new byte[] { 1 }), "virus.exe", false, default))).Code);
        Assert.Equal("IMPORT_MISSING_COLUMNS", (await Assert.ThrowsAsync<AppException>(() => t.References().ImportAsync(new MemoryStream("a;b\n1;2"u8.ToArray()), "x.csv", false, default))).Code);
    }
}

public class DocumentServiceTests
{
    private static byte[] Pdf => Encoding.ASCII.GetBytes("%PDF-1.4\n%test\n");

    [Fact]
    public async Task Upload_stores_file_under_random_name_with_metadata_and_audit()
    {
        await using var t = await TestContext.CreateAsync();
        var client = await t.AddClientAsync();
        var m = await t.Missions().CreateAsync(TestContext.NewMission(client.Id), default);
        var type = await t.Db.DocumentTypes.FirstAsync(x => x.Code == DocumentTypeCodes.Cmr);

        var doc = await t.Documents().UploadAsync(new UploadDocumentCommand(m.Id, type.Id, "CMR signée", "CMR.pdf", "application/pdf", Pdf.Length, new MemoryStream(Pdf)), default);

        var entity = await t.Db.Documents.SingleAsync();
        Assert.Equal("CMR.pdf", doc.FileName);
        Assert.DoesNotContain("CMR", entity.StoragePath);                    // nom physique = GUID
        Assert.True(await t.Storage.ExistsAsync(entity.StoragePath));        // fichier présent dans le stockage
        Assert.Equal(Pdf.Length, entity.FileSize);
        Assert.Equal(64, entity.Sha256!.Length);
        Assert.Contains(await t.Db.AuditLogs.ToListAsync(), a => a.Action == AuditActions.DocumentUpload);

        var content = await t.Documents().DownloadAsync(doc.Id, default);
        using var ms = new MemoryStream();
        await content.Content.CopyToAsync(ms);
        content.Content.Dispose();
        Assert.Equal(Pdf, ms.ToArray());
    }

    [Fact]
    public async Task Upload_rejects_disguised_or_oversized_files()
    {
        await using var t = await TestContext.CreateAsync();
        var client = await t.AddClientAsync();
        var m = await t.Missions().CreateAsync(TestContext.NewMission(client.Id), default);
        var typeId = (await t.Db.DocumentTypes.FirstAsync()).Id;
        var exe = Encoding.ASCII.GetBytes("MZ\x90\0fake");

        await Assert.ThrowsAsync<ValidationAppException>(() => t.Documents().UploadAsync(new UploadDocumentCommand(m.Id, typeId, null, "facture.pdf", "application/pdf", exe.Length, new MemoryStream(exe)), default));
        await Assert.ThrowsAsync<ValidationAppException>(() => t.Documents().UploadAsync(new UploadDocumentCommand(m.Id, typeId, null, "script.exe", "application/octet-stream", exe.Length, new MemoryStream(exe)), default));
        await Assert.ThrowsAsync<ValidationAppException>(() => t.Documents().UploadAsync(new UploadDocumentCommand(m.Id, typeId, null, "big.pdf", "application/pdf", 50L * 1024 * 1024, new MemoryStream(Pdf)), default));
        await Assert.ThrowsAsync<NotFoundException>(() => t.Documents().UploadAsync(new UploadDocumentCommand(9999, typeId, null, "a.pdf", "application/pdf", Pdf.Length, new MemoryStream(Pdf)), default));
        Assert.Empty(await t.Db.Documents.ToListAsync());
    }

    [Fact]
    public async Task Delete_is_logical_and_keeps_the_trace()
    {
        await using var t = await TestContext.CreateAsync();
        var client = await t.AddClientAsync();
        var m = await t.Missions().CreateAsync(TestContext.NewMission(client.Id), default);
        var typeId = (await t.Db.DocumentTypes.FirstAsync()).Id;
        var doc = await t.Documents().UploadAsync(new UploadDocumentCommand(m.Id, typeId, null, "bon.pdf", "application/pdf", Pdf.Length, new MemoryStream(Pdf)), default);

        await t.Documents().DeleteAsync(doc.Id, default);

        var entity = await t.Db.Documents.SingleAsync();
        Assert.True(entity.IsDeleted);
        Assert.True(await t.Storage.ExistsAsync(entity.StoragePath));
        Assert.Empty(await t.Documents().ListForMissionAsync(m.Id, default));
        Assert.Contains(await t.Db.AuditLogs.ToListAsync(), a => a.Action == AuditActions.DocumentDelete);
        await Assert.ThrowsAsync<NotFoundException>(() => t.Documents().DownloadAsync(doc.Id, default));
    }
}
