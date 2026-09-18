FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY backend.csproj ./
RUN dotnet restore backend.csproj

COPY . .
RUN dotnet publish backend.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

COPY --from=build /app/publish .

EXPOSE 8080
ENTRYPOINT ["sh", "-c", "dotnet backend.dll --urls http://0.0.0.0:${PORT:-8080}"]
