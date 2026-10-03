using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Transport.Application.Documents;
using Transport.Application.Interfaces;
using Transport.Infrastructure.Data;
using Transport.Infrastructure.Data.Seed;
using Transport.Infrastructure.Security;
using Transport.Infrastructure.Spreadsheets;
using Transport.Infrastructure.Storage;

namespace Transport.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        var connectionString = config.GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException("ConnectionStrings:DefaultConnection est manquante (variable ConnectionStrings__DefaultConnection).");

        services.AddDbContext<ApplicationDbContext>(options =>
            options.UseSqlServer(connectionString, sql =>
            {
                sql.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName);
                sql.CommandTimeout(30);
            }));
        services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<ApplicationDbContext>());
        services.AddScoped<DatabaseInitializer>();

        services.Configure<JwtOptions>(config.GetSection(JwtOptions.Section));
        services.AddSingleton<ITokenService, TokenService>();
        services.AddSingleton<IPasswordHasherService, PasswordHasherService>();

        services.Configure<StorageOptions>(config.GetSection(StorageOptions.Section));
        services.AddSingleton<IFileStorageService, LocalFileStorageService>();
        var maxMb = config.GetValue(StorageOptions.Section + ":MaxFileSizeMb", 10);
        services.AddSingleton(new DocumentPolicy { MaxFileSizeBytes = maxMb * 1024L * 1024L });

        services.AddSingleton<ISpreadsheetService, SpreadsheetService>();
        return services;
    }
}
