# syntax=docker/dockerfile:1
# ---------- Build ----------
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY TransportFlow.sln ./
COPY src/Transport.Domain/Transport.Domain.csproj src/Transport.Domain/
COPY src/Transport.Application/Transport.Application.csproj src/Transport.Application/
COPY src/Transport.Infrastructure/Transport.Infrastructure.csproj src/Transport.Infrastructure/
COPY src/Transport.Api/Transport.Api.csproj src/Transport.Api/
RUN dotnet restore src/Transport.Api/Transport.Api.csproj
COPY src/ src/
RUN dotnet publish src/Transport.Api/Transport.Api.csproj -c Release -o /app/publish --no-restore /p:UseAppHost=false

# ---------- Runtime ----------
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8080 \
    DOTNET_RUNNING_IN_CONTAINER=true \
    Storage__RootPath=/data/documents
RUN mkdir -p /data/documents && chown -R app:app /data
COPY --from=build /app/publish .
USER app
EXPOSE 8080
VOLUME ["/data/documents"]
ENTRYPOINT ["dotnet", "Transport.Api.dll"]
