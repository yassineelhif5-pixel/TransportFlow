using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Transport.Application.Common;

/// <summary>Enveloppe de réponse de succès : { success: true, data, message }.</summary>
public record ApiResponse<T>(bool Success, T? Data, string? Message = null);

public static class ApiResponse
{
    public static ApiResponse<T> Ok<T>(T data, string? message = null) => new(true, data, message);
}

/// <summary>Enveloppe d'erreur : { success: false, message, code, errors }.</summary>
public record ApiError(bool Success, string Message, string Code, IDictionary<string, string[]>? Errors = null, string? TraceId = null);

public record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize)
{
    public int TotalPages => PageSize == 0 ? 0 : (int)Math.Ceiling(Total / (double)PageSize);
}

public class PagedQuery
{
    private int _page = 1;
    private int _pageSize = 20;

    public int Page { get => _page; set => _page = value < 1 ? 1 : value; }
    public int PageSize { get => _pageSize; set => _pageSize = value is < 1 or > 200 ? 20 : value; }
    public string? Search { get; set; }
    public string? SortBy { get; set; }
    public string? SortDir { get; set; }

    public bool Descending => string.Equals(SortDir, "desc", StringComparison.OrdinalIgnoreCase);
    /// <summary>Tri descendant par défaut lorsque aucun sens n'est fourni (listes chronologiques).</summary>
    public bool DescendingOrDefault => SortDir is null || Descending;
}

public static class QueryableExtensions
{
    public static async Task<PagedResult<T>> ToPagedAsync<T>(this IQueryable<T> query, PagedQuery q, CancellationToken ct)
    {
        var total = await query.CountAsync(ct);
        var items = await query.Skip((q.Page - 1) * q.PageSize).Take(q.PageSize).ToListAsync(ct);
        return new PagedResult<T>(items, total, q.Page, q.PageSize);
    }

    public static IOrderedQueryable<T> OrderByDir<T, TKey>(this IQueryable<T> q, System.Linq.Expressions.Expression<Func<T, TKey>> key, bool desc)
        => desc ? q.OrderByDescending(key) : q.OrderBy(key);
}

public static class ValidationExtensions
{
    /// <summary>Valide et lève une ValidationAppException au format API.</summary>
    public static async Task EnsureValidAsync<T>(this IValidator<T> validator, T instance, CancellationToken ct)
    {
        var result = await validator.ValidateAsync(instance, ct);
        if (result.IsValid) return;
        var errors = result.Errors
            .GroupBy(e => char.ToLowerInvariant(e.PropertyName[0]) + e.PropertyName[1..])
            .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).Distinct().ToArray());
        throw new ValidationAppException(errors);
    }
}

public static class TextUtils
{
    /// <summary>Nettoie une chaîne saisie (trim, vide → null).</summary>
    public static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>Protège un CSV contre l'injection de formules (=, +, -, @).</summary>
    public static string CsvSafe(string? value)
    {
        var v = value ?? string.Empty;
        if (v.Length > 0 && "=+-@\t\r".Contains(v[0])) v = "'" + v;
        if (v.Contains(';') || v.Contains('"') || v.Contains('\n') || v.Contains(','))
            v = "\"" + v.Replace("\"", "\"\"") + "\"";
        return v;
    }
}
