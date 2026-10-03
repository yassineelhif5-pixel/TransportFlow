using System.IO.Compression;
using System.Text;
using System.Xml.Linq;
using Transport.Application.Common;
using Transport.Application.Interfaces;

namespace Transport.Infrastructure.Spreadsheets;

/// <summary>Lecture/écriture CSV et XLSX (Open XML) sans dépendance externe.</summary>
public class SpreadsheetService : ISpreadsheetService
{
    private static readonly XNamespace S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    private static readonly XNamespace R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private static readonly XNamespace Pr = "http://schemas.openxmlformats.org/package/2006/relationships";

    public async Task<IReadOnlyList<string[]>> ReadAsync(Stream stream, string extension, CancellationToken ct = default)
    {
        using var ms = new MemoryStream();
        await stream.CopyToAsync(ms, ct);
        ms.Position = 0;
        return extension.ToLowerInvariant() switch
        {
            ".csv" => ReadCsv(ms.ToArray()),
            ".xlsx" => ReadXlsx(ms),
            _ => throw new AppException("IMPORT_INVALID_FORMAT", "Format non pris en charge."),
        };
    }

    // ------------------------------------------------------------------ CSV

    internal static IReadOnlyList<string[]> ReadCsv(byte[] bytes)
    {
        string text;
        try { text = new UTF8Encoding(false, true).GetString(bytes); }
        catch (DecoderFallbackException) { text = Encoding.Latin1.GetString(bytes); } // CSV Excel « ANSI »
        text = text.TrimStart('﻿');

        var firstLine = text.Split('\n', 2)[0];
        var delimiter = new[] { ';', ',', '\t' }.OrderByDescending(d => firstLine.Count(c => c == d)).First();

        var rows = new List<string[]>();
        var row = new List<string>();
        var cell = new StringBuilder();
        var inQuotes = false;
        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            if (inQuotes)
            {
                if (c == '"' && i + 1 < text.Length && text[i + 1] == '"') { cell.Append('"'); i++; }
                else if (c == '"') inQuotes = false;
                else cell.Append(c);
            }
            else if (c == '"') inQuotes = true;
            else if (c == delimiter) { row.Add(cell.ToString()); cell.Clear(); }
            else if (c == '\r') { }
            else if (c == '\n') { row.Add(cell.ToString()); cell.Clear(); rows.Add(row.ToArray()); row.Clear(); }
            else cell.Append(c);
        }
        if (cell.Length > 0 || row.Count > 0) { row.Add(cell.ToString()); rows.Add(row.ToArray()); }
        return rows;
    }

    public byte[] WriteCsv(IReadOnlyList<string> headers, IEnumerable<IReadOnlyList<string?>> rows)
    {
        var sb = new StringBuilder();
        sb.Append(string.Join(';', headers.Select(TextUtils.CsvSafe))).Append("\r\n");
        foreach (var r in rows) sb.Append(string.Join(';', r.Select(TextUtils.CsvSafe))).Append("\r\n");
        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
    }

    // ------------------------------------------------------------------ XLSX lecture

    internal static IReadOnlyList<string[]> ReadXlsx(Stream stream)
    {
        using var zip = new ZipArchive(stream, ZipArchiveMode.Read);
        XDocument Load(string path)
        {
            var entry = zip.GetEntry(path) ?? throw new AppException("IMPORT_UNREADABLE", "Classeur Excel invalide.");
            if (entry.Length > 50 * 1024 * 1024) throw new AppException("IMPORT_TOO_LARGE", "Classeur Excel trop volumineux.");
            using var s = entry.Open();
            return XDocument.Load(s);
        }

        var shared = new List<string>();
        if (zip.GetEntry("xl/sharedStrings.xml") is not null)
            shared.AddRange(Load("xl/sharedStrings.xml").Root!.Elements(S + "si")
                .Select(si => string.Concat(si.Descendants(S + "t").Select(t => t.Value))));

        var workbook = Load("xl/workbook.xml");
        var firstSheet = workbook.Root!.Element(S + "sheets")?.Elements(S + "sheet").FirstOrDefault()
            ?? throw new AppException("IMPORT_EMPTY", "Le classeur ne contient aucune feuille.");
        var relId = firstSheet.Attribute(R + "id")?.Value;
        var rels = Load("xl/_rels/workbook.xml.rels");
        var target = rels.Root!.Elements(Pr + "Relationship").FirstOrDefault(x => x.Attribute("Id")?.Value == relId)?.Attribute("Target")?.Value
            ?? "worksheets/sheet1.xml";
        var sheetPath = target.StartsWith('/') ? target.TrimStart('/') : "xl/" + target;

        var rows = new List<string[]>();
        foreach (var row in Load(sheetPath).Descendants(S + "row"))
        {
            var cells = new SortedDictionary<int, string>();
            var next = 0;
            foreach (var c in row.Elements(S + "c"))
            {
                var col = c.Attribute("r") is { } r ? ColumnIndex(r.Value) : next;
                next = col + 1;
                var type = c.Attribute("t")?.Value;
                var v = c.Element(S + "v")?.Value;
                cells[col] = type switch
                {
                    "s" when int.TryParse(v, out var idx) && idx < shared.Count => shared[idx],
                    "inlineStr" => string.Concat(c.Descendants(S + "t").Select(t => t.Value)),
                    "b" => v == "1" ? "VRAI" : "FAUX",
                    _ => v ?? "",
                };
            }
            var max = cells.Count == 0 ? 0 : cells.Keys.Max() + 1;
            var arr = new string[max];
            for (var i = 0; i < max; i++) arr[i] = cells.GetValueOrDefault(i, "");
            rows.Add(arr);
        }
        return rows;
    }

    private static int ColumnIndex(string reference)
    {
        var col = 0;
        foreach (var ch in reference.TakeWhile(char.IsLetter)) col = col * 26 + (char.ToUpperInvariant(ch) - 'A' + 1);
        return col - 1;
    }

    // ------------------------------------------------------------------ XLSX écriture

    public byte[] WriteXlsx(string sheetName, IReadOnlyList<string> headers, IEnumerable<IReadOnlyList<string?>> rows)
    {
        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
        {
            void Add(string path, string content)
            {
                using var w = new StreamWriter(zip.CreateEntry(path, CompressionLevel.Fastest).Open(), new UTF8Encoding(false));
                w.Write(content);
            }

            Add("[Content_Types].xml", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>""");
            Add("_rels/.rels", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>""");
            Add("xl/_rels/workbook.xml.rels", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>""");
            var safeName = new string(sheetName.Where(ch => !"[]:*?/\\".Contains(ch)).Take(31).ToArray());
            Add("xl/workbook.xml", $"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="{Esc(safeName)}" sheetId="1" r:id="rId1"/></sheets></workbook>""");
            Add("xl/styles.xml", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF142337"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>""");

            var sb = new StringBuilder();
            sb.Append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>""");
            sb.Append("<cols>");
            for (var i = 0; i < headers.Count; i++) sb.Append($"<col min=\"{i + 1}\" max=\"{i + 1}\" width=\"22\" customWidth=\"1\"/>");
            sb.Append("</cols><sheetData>");
            AppendRow(sb, 1, headers, style: 1);
            var n = 2;
            foreach (var r in rows) AppendRow(sb, n++, r, style: 0);
            sb.Append("</sheetData></worksheet>");
            Add("xl/worksheets/sheet1.xml", sb.ToString());
        }
        return ms.ToArray();
    }

    private static void AppendRow(StringBuilder sb, int rowNumber, IReadOnlyList<string?> cells, int style)
    {
        sb.Append($"<row r=\"{rowNumber}\">");
        for (var i = 0; i < cells.Count; i++)
        {
            var v = cells[i];
            if (string.IsNullOrEmpty(v)) continue;
            sb.Append($"<c r=\"{ColumnName(i)}{rowNumber}\" t=\"inlineStr\"{(style > 0 ? $" s=\"{style}\"" : "")}><is><t xml:space=\"preserve\">{Esc(v)}</t></is></c>");
        }
        sb.Append("</row>");
    }

    private static string ColumnName(int index)
    {
        var name = "";
        index++;
        while (index > 0) { var m = (index - 1) % 26; name = (char)('A' + m) + name; index = (index - m) / 26; }
        return name;
    }

    private static string Esc(string v)
    {
        var clean = new string(v.Where(ch => ch == '\t' || ch == '\n' || ch == '\r' || ch >= 0x20).ToArray());
        return System.Security.SecurityElement.Escape(clean) ?? "";
    }
}
