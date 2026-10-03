using System.IO.Compression;
using System.Text;
using Transport.Application.Common;
using Transport.Application.Documents;
using Transport.Domain.Enums;
using Transport.Infrastructure.Security;
using Transport.Infrastructure.Spreadsheets;

namespace Transport.Tests.Unit;

public class StatusMachineTests
{
    [Theory]
    [InlineData(MissionStatusCodes.Assigned, MissionStatusCodes.ToBePickedUp, true)]
    [InlineData(MissionStatusCodes.ToBePickedUp, MissionStatusCodes.PickedUp, true)]
    [InlineData(MissionStatusCodes.PickedUp, MissionStatusCodes.InProgress, true)]
    [InlineData(MissionStatusCodes.InProgress, MissionStatusCodes.Completed, true)]
    [InlineData(MissionStatusCodes.Anomaly, MissionStatusCodes.InProgress, true)]
    [InlineData(MissionStatusCodes.Created, MissionStatusCodes.Completed, false)]
    [InlineData(MissionStatusCodes.Completed, MissionStatusCodes.InProgress, false)]
    [InlineData(MissionStatusCodes.Cancelled, MissionStatusCodes.Created, false)]
    public void Transitions_follow_the_lifecycle(string from, string to, bool expected) =>
        Assert.Equal(expected, MissionStatusCodes.CanTransition(from, to));

    [Fact]
    public void Final_statuses_have_no_outgoing_transition()
    {
        foreach (var s in MissionStatusCodes.Final) Assert.Empty(MissionStatusCodes.Transitions[s]);
    }
}

public class DocumentPolicyTests
{
    [Fact]
    public void Signature_is_checked_against_extension()
    {
        Assert.True(DocumentPolicy.SignatureMatches(".pdf", "%PDF-1.7"u8.ToArray()));
        Assert.True(DocumentPolicy.SignatureMatches(".png", new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }));
        Assert.True(DocumentPolicy.SignatureMatches(".jpg", new byte[] { 0xFF, 0xD8, 0xFF, 0xE0 }));
        Assert.False(DocumentPolicy.SignatureMatches(".pdf", "MZ\x90\0"u8.ToArray())); // exécutable renommé
        Assert.False(DocumentPolicy.SignatureMatches(".exe", "MZ"u8.ToArray()));
    }

    [Theory]
    [InlineData("../../etc/passwd", "passwd")]
    [InlineData("C:\\temp\\CMR.jpg", "CMR.jpg")]
    [InlineData("..hidden.pdf", "hidden.pdf")]
    [InlineData("bon<script>.pdf", "bonscript.pdf")]
    public void File_names_are_sanitized(string input, string expected) =>
        Assert.Equal(expected, DocumentPolicy.SanitizeFileName(input));
}

public class SpreadsheetTests
{
    [Fact]
    public void Csv_with_semicolons_quotes_and_bom_is_parsed()
    {
        var csv = "\uFEFFRéférence;Client;Notes\r\nREF-1;ABC;\"Quai 3; porte B\"\r\nREF-2;\"Nordis \"\"Nord\"\"\";\r\n";
        var rows = SpreadsheetService.ReadCsv(Encoding.UTF8.GetBytes(csv));
        Assert.Equal(3, rows.Count);
        Assert.Equal("Référence", rows[0][0]);
        Assert.Equal("Quai 3; porte B", rows[1][2]);
        Assert.Equal("Nordis \"Nord\"", rows[2][1]);
    }

    [Fact]
    public void Latin1_csv_from_excel_is_decoded()
    {
        var bytes = Encoding.Latin1.GetBytes("Référence,Client\nREF-1,Société Générale\n");
        var rows = SpreadsheetService.ReadCsv(bytes);
        Assert.Equal("Société Générale", rows[1][1]);
    }

    [Fact]
    public async Task Xlsx_written_by_export_can_be_read_back()
    {
        var svc = new SpreadsheetService();
        var bytes = svc.WriteXlsx("refs", new[] { "Référence", "Client" }, new[] { new[] { "REF-1", "ABC & Co <test>" } });
        using var zip = new ZipArchive(new MemoryStream(bytes));
        Assert.NotNull(zip.GetEntry("xl/worksheets/sheet1.xml"));
        var rows = await svc.ReadAsync(new MemoryStream(bytes), ".xlsx");
        Assert.Equal("ABC & Co <test>", rows[1][1]);
    }

    [Fact]
    public void Csv_export_neutralizes_formula_injection()
    {
        Assert.Equal("'=HYPERLINK(1)", TextUtils.CsvSafe("=HYPERLINK(1)"));
        Assert.Equal("\"a;b\"", TextUtils.CsvSafe("a;b"));
    }
}

public class SecurityTests
{
    [Fact]
    public void Passwords_are_hashed_with_salt_and_verified()
    {
        var hasher = new PasswordHasherService();
        var h1 = hasher.Hash("admin");
        var h2 = hasher.Hash("admin");
        Assert.NotEqual("admin", h1);
        Assert.NotEqual(h1, h2); // sel aléatoire
        Assert.True(hasher.Verify(h1, "admin", out _));
        Assert.False(hasher.Verify(h1, "Admin", out _));
        Assert.False(hasher.Verify("pas-un-hash", "admin", out _));
    }

    [Fact]
    public void Refresh_tokens_are_random_and_stored_hashed()
    {
        var tokens = new TokenService(Microsoft.Extensions.Options.Options.Create(new JwtOptions { Secret = new string('k', 40) }));
        var a = tokens.CreateRefreshToken();
        var b = tokens.CreateRefreshToken();
        Assert.NotEqual(a, b);
        Assert.Equal(64, tokens.HashRefreshToken(a).Length);
        Assert.NotEqual(a, tokens.HashRefreshToken(a));
    }

    [Fact]
    public void Short_jwt_secret_is_rejected()
    {
        Assert.Throws<InvalidOperationException>(() => new TokenService(Microsoft.Extensions.Options.Options.Create(new JwtOptions { Secret = "court" })));
    }
}
