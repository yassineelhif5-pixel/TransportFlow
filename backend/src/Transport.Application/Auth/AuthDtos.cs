using FluentValidation;

namespace Transport.Application.Auth;

public record LoginRequest(string Username, string Password, bool RememberMe = false, string? Audience = null);
public record RefreshRequest(string RefreshToken);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword, string ConfirmPassword);

public record UserInfoDto(
    int Id, string Username, string Email, string FirstName, string LastName, string FullName,
    string Role, string? Phone, DateTime? LastLoginAt, bool MustChangePassword);

public record LoginResponse(string AccessToken, string RefreshToken, int ExpiresIn, DateTime ExpiresAt, UserInfoDto User);

public class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Username).NotEmpty().WithMessage("L'identifiant est obligatoire.").MaximumLength(256);
        RuleFor(x => x.Password).NotEmpty().WithMessage("Le mot de passe est obligatoire.").MaximumLength(256);
    }
}

public static class PasswordPolicy
{
    public const int MinLength = 8;

    public static IRuleBuilderOptions<T, string> StrongPassword<T>(this IRuleBuilder<T, string> rule) =>
        rule.NotEmpty().WithMessage("Le nouveau mot de passe est obligatoire.")
            .MinimumLength(MinLength).WithMessage($"Le mot de passe doit contenir au moins {MinLength} caractères.")
            .MaximumLength(128)
            .Matches("[A-Z]").WithMessage("Le mot de passe doit contenir au moins une majuscule.")
            .Matches("[a-z]").WithMessage("Le mot de passe doit contenir au moins une minuscule.")
            .Matches("[0-9]").WithMessage("Le mot de passe doit contenir au moins un chiffre.");
}

public class ChangePasswordRequestValidator : AbstractValidator<ChangePasswordRequest>
{
    public ChangePasswordRequestValidator()
    {
        RuleFor(x => x.CurrentPassword).NotEmpty().WithMessage("L'ancien mot de passe est obligatoire.");
        RuleFor(x => x.NewPassword).StrongPassword()
            .NotEqual(x => x.CurrentPassword).WithMessage("Le nouveau mot de passe doit être différent de l'ancien.");
        RuleFor(x => x.ConfirmPassword).Equal(x => x.NewPassword).WithMessage("La confirmation ne correspond pas au nouveau mot de passe.");
    }
}
