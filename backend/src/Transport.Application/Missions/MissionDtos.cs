using FluentValidation;
using Transport.Application.Common;

namespace Transport.Application.Missions;

public record LocationDto(string? Label, string Address, string City, string? PostalCode, string Country);

public record StatusDto(string Code, string Label);

public record MissionListItemDto(
    int Id, string ReferenceNumber, int ClientId, string ClientName, DateTime PlannedDate,
    string PickupCity, string DeliveryCity, int? DriverId, string? DriverName, string? VehiclePlate,
    string StatusCode, string StatusLabel, string? LastAction, DateTime? LastActionAt);

public record DriverSummaryDto(int Id, string FullName, string Phone, string? Email);
public record VehicleSummaryDto(int Id, string PlateNumber, string Brand, string Model, string Type);
public record ClientSummaryDto(int Id, string Code, string Name);

public record AssignmentDto(
    int Id, int DriverId, string DriverName, int? VehicleId, string? VehiclePlate,
    string AssignedByName, DateTime AssignedAt, string Status, DateTime? EndedAt, string? Comment);

public record MissionDetailDto(
    int Id, int ReferenceId, string ReferenceNumber, ClientSummaryDto Client, DateTime PlannedDate,
    LocationDto Pickup, LocationDto Delivery, string? Description, string? Goods, decimal? WeightKg, decimal? VolumeM3,
    StatusDto Status, DriverSummaryDto? Driver, VehicleSummaryDto? Vehicle,
    DateTime CreatedAt, string? CreatedByName, DateTime? UpdatedAt, string? LastAction, DateTime? LastActionAt,
    bool IsLocked, IReadOnlyList<StatusDto> AllowedTransitions, IReadOnlyList<AssignmentDto> Assignments, int DocumentCount);

public record MissionTimelineItemDto(DateTime At, string Type, string Title, string? Description, string? UserName, string? StatusCode);

public class MissionQuery : PagedQuery
{
    public string? Status { get; set; }
    public int? ClientId { get; set; }
    public int? DriverId { get; set; }
    public DateTime? DateFrom { get; set; }
    public DateTime? DateTo { get; set; }
    /// <summary>today | week | month (raccourci de période).</summary>
    public string? Period { get; set; }
    /// <summary>Identifiants séparés par des virgules (export d'une sélection).</summary>
    public string? Ids { get; set; }
}

public record LocationInput(string? Label, string Address, string City, string? PostalCode, string? Country);

public record MissionUpsertRequest(
    string ReferenceNumber, int ClientId, DateTime PlannedDate, LocationInput Pickup, LocationInput Delivery,
    string? Description, string? Goods, decimal? WeightKg, decimal? VolumeM3,
    int? DriverId = null, int? VehicleId = null, string? AssignComment = null);

public record AssignMissionRequest(int DriverId, int? VehicleId, string? Comment);

public record ChangeStatusRequest(string StatusCode, string? Comment, decimal? Latitude = null, decimal? Longitude = null);

public static class ReferenceFormat
{
    public const string Pattern = @"^[A-Za-z0-9][A-Za-z0-9\-_/\.]{1,49}$";
    public const string Message = "Format de référence invalide (2 à 50 caractères : lettres, chiffres, - _ / .).";
}

public class LocationInputValidator : AbstractValidator<LocationInput>
{
    public LocationInputValidator()
    {
        RuleFor(x => x.Address).NotEmpty().WithMessage("L'adresse est obligatoire.").MaximumLength(250);
        RuleFor(x => x.City).NotEmpty().WithMessage("La ville est obligatoire.").MaximumLength(120);
        RuleFor(x => x.PostalCode).MaximumLength(20);
        RuleFor(x => x.Country).MaximumLength(80);
        RuleFor(x => x.Label).MaximumLength(150);
    }
}

public class MissionUpsertRequestValidator : AbstractValidator<MissionUpsertRequest>
{
    public MissionUpsertRequestValidator()
    {
        RuleFor(x => x.ReferenceNumber).NotEmpty().WithMessage("La référence est obligatoire.")
            .Matches(ReferenceFormat.Pattern).WithMessage(ReferenceFormat.Message);
        RuleFor(x => x.ClientId).GreaterThan(0).WithMessage("Le client est obligatoire.");
        RuleFor(x => x.PlannedDate).NotEmpty().WithMessage("La date prévue est obligatoire.")
            .Must(d => d.Year is >= 2000 and <= 2100).WithMessage("La date prévue est invalide.");
        RuleFor(x => x.Pickup).NotNull().WithMessage("Le lieu de chargement est obligatoire.").SetValidator(new LocationInputValidator());
        RuleFor(x => x.Delivery).NotNull().WithMessage("Le lieu de livraison est obligatoire.").SetValidator(new LocationInputValidator());
        RuleFor(x => x.Description).MaximumLength(2000);
        RuleFor(x => x.Goods).MaximumLength(250);
        RuleFor(x => x.WeightKg).InclusiveBetween(0, 100000).When(x => x.WeightKg.HasValue).WithMessage("Le poids doit être compris entre 0 et 100 000 kg.");
        RuleFor(x => x.VolumeM3).InclusiveBetween(0, 1000).When(x => x.VolumeM3.HasValue).WithMessage("Le volume doit être compris entre 0 et 1 000 m³.");
        RuleFor(x => x.AssignComment).MaximumLength(500);
    }
}

public class AssignMissionRequestValidator : AbstractValidator<AssignMissionRequest>
{
    public AssignMissionRequestValidator()
    {
        RuleFor(x => x.DriverId).GreaterThan(0).WithMessage("Le chauffeur est obligatoire.");
        RuleFor(x => x.Comment).MaximumLength(500);
    }
}

public class ChangeStatusRequestValidator : AbstractValidator<ChangeStatusRequest>
{
    public ChangeStatusRequestValidator()
    {
        RuleFor(x => x.StatusCode).NotEmpty().WithMessage("Le statut est obligatoire.")
            .Must(s => Domain.Enums.MissionStatusCodes.All.Contains(s)).WithMessage("Statut inconnu.");
        RuleFor(x => x.Comment).MaximumLength(1000);
        RuleFor(x => x.Comment).NotEmpty().When(x => x.StatusCode == Domain.Enums.MissionStatusCodes.Anomaly)
            .WithMessage("Décrivez l'anomalie rencontrée.");
        RuleFor(x => x.Latitude).InclusiveBetween(-90, 90).When(x => x.Latitude.HasValue);
        RuleFor(x => x.Longitude).InclusiveBetween(-180, 180).When(x => x.Longitude.HasValue);
    }
}
