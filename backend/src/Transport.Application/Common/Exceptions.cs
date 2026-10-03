namespace Transport.Application.Common;

/// <summary>Exception métier traduite par le middleware global en réponse JSON cohérente.</summary>
public class AppException : Exception
{
    public string Code { get; }
    public int StatusCode { get; }
    public IDictionary<string, string[]>? Errors { get; }

    public AppException(string code, string message, int statusCode = 400, IDictionary<string, string[]>? errors = null)
        : base(message)
    {
        Code = code;
        StatusCode = statusCode;
        Errors = errors;
    }
}

public class NotFoundException : AppException
{
    public NotFoundException(string code, string message) : base(code, message, 404) { }
}

public class ConflictException : AppException
{
    public ConflictException(string code, string message) : base(code, message, 409) { }
}

public class BusinessRuleException : AppException
{
    public BusinessRuleException(string code, string message) : base(code, message, 422) { }
}

public class ForbiddenException : AppException
{
    public ForbiddenException(string message = "Vous n'avez pas les droits nécessaires pour cette action.")
        : base("FORBIDDEN", message, 403) { }
}

public class UnauthorizedAppException : AppException
{
    public UnauthorizedAppException(string code, string message) : base(code, message, 401) { }
}

public class ValidationAppException : AppException
{
    public ValidationAppException(IDictionary<string, string[]> errors)
        : base("VALIDATION_ERROR", errors.Values.SelectMany(v => v).FirstOrDefault() ?? "Données invalides.", 400, errors) { }
}
