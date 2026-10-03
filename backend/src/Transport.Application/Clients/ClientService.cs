using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Transport.Application.Common;
using Transport.Application.Drivers;
using Transport.Application.Interfaces;
using Transport.Application.Missions;
using Transport.Application.References;
using Transport.Domain.Entities;
using Transport.Domain.Enums;

namespace Transport.Application.Clients;

public record ClientDto(int Id, string Code, string Name, string? Address, string? City, string? PostalCode, string Country,
    string? Phone, string? Email, bool IsActive, int ReferenceCount, int MissionCount, int ActiveMissionCount);

public record StatusCountDto(string Code, string Label, int Count);

public record ClientDetailDto(ClientDto Client, IReadOnlyList<ReferenceDto> References, IReadOnlyList<MissionListItemDto> Missions,
    IReadOnlyList<StatusCountDto> MissionsByStatus, int CompletedThisMonth);

public record ClientUpsertRequest(string Code, string Name, string? Address, string? City, string? PostalCode, string? Country, string? Phone, string? Email);

public class ClientQuery : PagedQuery
{
    public bool? IsActive { get; set; }
}

public class ClientUpsertRequestValidator : AbstractValidator<ClientUpsertRequest>
{
    public ClientUpsertRequestValidator()
    {
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code client est obligatoire.")
            .Matches("^[A-Za-z0-9_-]{2,20}$").WithMessage("Code client invalide (2 à 20 caractères : lettres, chiffres, - _).");
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est obligatoire.").MaximumLength(200);
        RuleFor(x => x.Email).EmailAddress().WithMessage("Adresse e-mail invalide.").When(x => !string.IsNullOrWhiteSpace(x.Email));
        RuleFor(x => x.Phone).Matches(@"^\+?[0-9 .\-()]{6,20}$").WithMessage("Numéro de téléphone invalide.").When(x => !string.IsNullOrWhiteSpace(x.Phone));
        RuleFor(x => x.Address).MaximumLength(250);
        RuleFor(x => x.City).MaximumLength(120);
        RuleFor(x => x.PostalCode).MaximumLength(20);
        RuleFor(x => x.Country).MaximumLength(80);
    }
}

public interface IClientService
{
    Task<PagedResult<ClientDto>> ListAsync(ClientQuery q, CancellationToken ct);
    Task<ClientDetailDto> GetAsync(int id, CancellationToken ct);
    Task<ClientDetailDto> CreateAsync(ClientUpsertRequest r, CancellationToken ct);
    Task<ClientDetailDto> UpdateAsync(int id, ClientUpsertRequest r, CancellationToken ct);
    Task<ClientDetailDto> SetActiveAsync(int id, bool isActive, CancellationToken ct);
}

public class ClientService : IClientService
{
    private readonly IApplicationDbContext _db;
    private readonly ICurrentUserService _current;
    private readonly IAuditService _audit;
    private readonly IMissionService _missions;
    private readonly IReferenceService _references;
    private readonly IValidator<ClientUpsertRequest> _validator;

    public ClientService(IApplicationDbContext db, ICurrentUserService current, IAuditService audit,
        IMissionService missions, IReferenceService references, IValidator<ClientUpsertRequest> validator)
    {
        _db = db; _current = current; _audit = audit; _missions = missions; _references = references; _validator = validator;
    }

    private IQueryable<ClientDto> Query(ClientQuery q)
    {
        var query = _db.Clients.AsNoTracking().Where(c => !c.IsDeleted);
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(c => c.Name.Contains(s) || c.Code.Contains(s) || (c.City != null && c.City.Contains(s)));
        }
        if (q.IsActive is { } a) query = query.Where(c => c.IsActive == a);
        query = q.SortBy?.ToLowerInvariant() switch
        {
            "code" => query.OrderByDir(c => c.Code, q.Descending),
            "city" => query.OrderByDir(c => c.City, q.Descending),
            "country" => query.OrderByDir(c => c.Country, q.Descending),
            _ => query.OrderByDir(c => c.Name, q.Descending),
        };
        return query.Select(c => new ClientDto(c.Id, c.Code, c.Name, c.Address, c.City, c.PostalCode, c.Country, c.Phone, c.Email, c.IsActive,
            c.References.Count(r => !r.IsDeleted), c.Missions.Count(m => !m.IsDeleted),
            c.Missions.Count(m => !m.IsDeleted && MissionStatusCodes.Active.Contains(m.CurrentStatus.Code))));
    }

    public Task<PagedResult<ClientDto>> ListAsync(ClientQuery q, CancellationToken ct) => Query(q).ToPagedAsync(q, ct);

    public async Task<ClientDetailDto> GetAsync(int id, CancellationToken ct)
    {
        var client = await Query(new ClientQuery()).FirstOrDefaultAsync(c => c.Id == id, ct)
            ?? throw new NotFoundException("CLIENT_NOT_FOUND", "Le client n'existe pas.");
        var refs = await _references.ListAsync(new ReferenceQuery { ClientId = id, PageSize = 20 }, ct);
        var missions = await _missions.ListAsync(new MissionQuery { ClientId = id, PageSize = 20 }, ct);
        var byStatus = await _db.Missions.AsNoTracking().Where(m => m.ClientId == id && !m.IsDeleted)
            .GroupBy(m => new { m.CurrentStatus.Code, m.CurrentStatus.Label, m.CurrentStatus.SortOrder })
            .Select(g => new { g.Key.Code, g.Key.Label, g.Key.SortOrder, Count = g.Count() })
            .OrderBy(x => x.SortOrder).ToListAsync(ct);
        var monthStart = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var completedMonth = await _db.MissionStatusHistories.CountAsync(h => h.Mission.ClientId == id && h.ToStatus.Code == MissionStatusCodes.Completed && h.ChangedAt >= monthStart, ct);
        return new ClientDetailDto(client, refs.Items, missions.Items, byStatus.Select(s => new StatusCountDto(s.Code, s.Label, s.Count)).ToList(), completedMonth);
    }

    public async Task<ClientDetailDto> CreateAsync(ClientUpsertRequest r, CancellationToken ct)
    {
        await _validator.EnsureValidAsync(r, ct);
        var code = r.Code.Trim().ToUpperInvariant();
        if (await _db.Clients.AnyAsync(c => c.Code == code, ct))
            throw new ConflictException("CLIENT_CODE_EXISTS", $"Le code client {code} existe déjà.");
        var client = new Client { Code = code, CreatedBy = _current.UserId, CreatedAt = DateTime.UtcNow, IsActive = true };
        Apply(client, r);
        _db.Clients.Add(client);
        await _db.SaveChangesAsync(ct);
        _audit.Add("Client", client.Id, AuditActions.Create, $"Client {client.Name} ({code}) créé.");
        await _db.SaveChangesAsync(ct);
        return await GetAsync(client.Id, ct);
    }

    public async Task<ClientDetailDto> UpdateAsync(int id, ClientUpsertRequest r, CancellationToken ct)
    {
        await _validator.EnsureValidAsync(r, ct);
        var client = await _db.Clients.FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted, ct)
            ?? throw new NotFoundException("CLIENT_NOT_FOUND", "Le client n'existe pas.");
        var code = r.Code.Trim().ToUpperInvariant();
        if (code != client.Code && await _db.Clients.AnyAsync(c => c.Code == code && c.Id != id, ct))
            throw new ConflictException("CLIENT_CODE_EXISTS", $"Le code client {code} existe déjà.");
        var before = new { client.Code, client.Name, client.City, client.Country, client.Phone, client.Email };
        client.Code = code;
        Apply(client, r);
        client.UpdatedAt = DateTime.UtcNow;
        client.UpdatedBy = _current.UserId;
        _audit.Add("Client", client.Id, AuditActions.Update, $"Client {client.Name} modifié.", before,
            new { client.Code, client.Name, client.City, client.Country, client.Phone, client.Email });
        await _db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task<ClientDetailDto> SetActiveAsync(int id, bool isActive, CancellationToken ct)
    {
        var client = await _db.Clients.FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted, ct)
            ?? throw new NotFoundException("CLIENT_NOT_FOUND", "Le client n'existe pas.");
        client.IsActive = isActive;
        client.UpdatedAt = DateTime.UtcNow;
        client.UpdatedBy = _current.UserId;
        _audit.Add("Client", client.Id, AuditActions.Update, $"Client {client.Name} {(isActive ? "activé" : "désactivé")}.",
            new { IsActive = !isActive }, new { IsActive = isActive });
        await _db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    private static void Apply(Client c, ClientUpsertRequest r)
    {
        c.Name = r.Name.Trim();
        c.Address = TextUtils.Clean(r.Address);
        c.City = TextUtils.Clean(r.City);
        c.PostalCode = TextUtils.Clean(r.PostalCode);
        c.Country = TextUtils.Clean(r.Country) ?? "France";
        c.Phone = TextUtils.Clean(r.Phone);
        c.Email = TextUtils.Clean(r.Email)?.ToLowerInvariant();
    }
}
