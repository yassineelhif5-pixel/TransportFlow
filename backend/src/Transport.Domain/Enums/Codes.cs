namespace Transport.Domain.Enums;

/// <summary>Codes de rôles (table Role).</summary>
public static class RoleCodes
{
    public const string Admin = "ADMIN";
    public const string Driver = "DRIVER";
    public static readonly string[] All = { Admin, Driver };
}

/// <summary>Codes des statuts de mission (table MissionStatus).</summary>
public static class MissionStatusCodes
{
    public const string Created = "CREATED";
    public const string Assigned = "ASSIGNED";
    public const string ToBePickedUp = "TO_BE_PICKED_UP";
    public const string PickedUp = "PICKED_UP";
    public const string InProgress = "IN_PROGRESS";
    public const string Completed = "COMPLETED";
    public const string Cancelled = "CANCELLED";
    public const string Anomaly = "ANOMALY";

    public static readonly string[] All =
        { Created, Assigned, ToBePickedUp, PickedUp, InProgress, Completed, Cancelled, Anomaly };

    /// <summary>Statuts finaux : la mission n'est plus modifiable librement.</summary>
    public static readonly string[] Final = { Completed, Cancelled };

    /// <summary>Statuts considérés comme « en cours » pour le tableau de bord.</summary>
    public static readonly string[] Active = { Assigned, ToBePickedUp, PickedUp, InProgress };

    /// <summary>Machine à états : transitions autorisées via le changement de statut.
    /// ASSIGNED n'est atteignable que par une affectation.</summary>
    public static readonly IReadOnlyDictionary<string, string[]> Transitions = new Dictionary<string, string[]>
    {
        [Created] = new[] { Cancelled },
        [Assigned] = new[] { ToBePickedUp, Anomaly, Cancelled },
        [ToBePickedUp] = new[] { PickedUp, Anomaly, Cancelled },
        [PickedUp] = new[] { InProgress, Anomaly },
        [InProgress] = new[] { Completed, Anomaly },
        [Anomaly] = new[] { ToBePickedUp, PickedUp, InProgress, Cancelled },
        [Completed] = Array.Empty<string>(),
        [Cancelled] = Array.Empty<string>(),
    };

    public static bool CanTransition(string from, string to) =>
        Transitions.TryGetValue(from, out var allowed) && allowed.Contains(to);
}

public static class AuditActions
{
    public const string Create = "CREATE";
    public const string Update = "UPDATE";
    public const string Delete = "DELETE";
    public const string Login = "LOGIN";
    public const string LoginFailed = "LOGIN_FAILED";
    public const string Logout = "LOGOUT";
    public const string Assign = "ASSIGN";
    public const string Unassign = "UNASSIGN";
    public const string StatusChange = "STATUS_CHANGE";
    public const string DocumentUpload = "DOCUMENT_UPLOAD";
    public const string DocumentDownload = "DOCUMENT_DOWNLOAD";
    public const string DocumentDelete = "DOCUMENT_DELETE";
    public const string Import = "IMPORT";
    public const string Export = "EXPORT";
    public const string PasswordChange = "PASSWORD_CHANGE";
}

public static class ReferenceSources
{
    public const string Manual = "MANUAL";
    public const string Import = "IMPORT";
    public const string Api = "API";
    public static readonly string[] All = { Manual, Import, Api };
}

public static class ReferenceStatuses
{
    public const string Open = "OPEN";
    public const string Used = "USED";
    public const string Cancelled = "CANCELLED";
    public static readonly string[] All = { Open, Used, Cancelled };
}

public static class VehicleStatuses
{
    public const string Available = "AVAILABLE";
    public const string InUse = "IN_USE";
    public const string Maintenance = "MAINTENANCE";
    public const string OutOfService = "OUT_OF_SERVICE";
    public static readonly string[] All = { Available, InUse, Maintenance, OutOfService };
}

public static class AssignmentStatuses
{
    public const string Active = "ACTIVE";
    public const string Replaced = "REPLACED";
    public const string Ended = "ENDED";
    public static readonly string[] All = { Active, Replaced, Ended };
}

public static class DocumentTypeCodes
{
    public const string TransportOrder = "BON_TRANSPORT";
    public const string Cmr = "CMR";
    public const string PickupPhoto = "PHOTO_PICKUP";
    public const string DeliveryPhoto = "PHOTO_DELIVERY";
    public const string DeliveryProof = "PREUVE_LIVRAISON";
    public const string AnomalyReport = "ANOMALIE";
    public const string Other = "AUTRE";
}

public static class NotificationTypes
{
    public const string Info = "INFO";
    public const string Success = "SUCCESS";
    public const string Warning = "WARNING";
    public const string Danger = "DANGER";
}
