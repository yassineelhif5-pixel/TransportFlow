using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Transport.Application.Auth;
using Transport.Application.Clients;
using Transport.Application.Dashboard;
using Transport.Application.Documents;
using Transport.Application.Drivers;
using Transport.Application.History;
using Transport.Application.Interfaces;
using Transport.Application.Missions;
using Transport.Application.Notifications;
using Transport.Application.References;
using Transport.Application.Search;
using Transport.Application.Services;
using Transport.Application.Users;
using Transport.Application.Vehicles;

namespace Transport.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddValidatorsFromAssembly(typeof(DependencyInjection).Assembly, includeInternalTypes: true);

        services.AddScoped<IAuditService, AuditService>();
        services.AddScoped<INotificationService, NotificationService>();
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IMissionService, MissionService>();
        services.AddScoped<IReferenceService, ReferenceService>();
        services.AddScoped<IDriverService, DriverService>();
        services.AddScoped<IClientService, ClientService>();
        services.AddScoped<IVehicleService, VehicleService>();
        services.AddScoped<IDocumentService, DocumentService>();
        services.AddScoped<IDashboardService, DashboardService>();
        services.AddScoped<IHistoryService, HistoryService>();
        services.AddScoped<IUserNotificationService, UserNotificationService>();
        services.AddScoped<IUserService, UserService>();
        services.AddScoped<ISearchService, SearchService>();
        services.AddScoped<IExportService, ExportService>();
        services.AddScoped<ISettingsService, SettingsService>();
        return services;
    }
}
