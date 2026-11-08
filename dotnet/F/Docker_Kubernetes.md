# Docker a Kubernetes v .NET

Příklady navazují na ASP.NET Core 10 / C# 14. Kontejner sdílí jádro hostitele a potřebuje kompatibilní OS i architekturu; nezaručuje stejné chování „kdekoli“. Image je předpis souborů a nastavení, kontejner je její běžící instance.

## Docker

Port aplikace uvnitř kontejneru a publikovaný port hostitele jsou dvě různé hodnoty. Moderní ASP.NET images od .NET 8 přešly na 8080; níže port přesto nastavujeme výslovně. `EXPOSE` port pouze dokumentuje, nezpřístupňuje jej hostiteli. [Změna portu](https://learn.microsoft.com/en-us/dotnet/core/compatibility/containers/8.0/aspnet-port).

### Dockerfile pro .NET aplikaci

**Soubor `Dockerfile`** pro jediný projekt `MojeApp.csproj` v kořeni build kontextu. Vyžaduje Docker s Linux kontejnery. Projekt musí obsahovat health endpointy níže. `.dockerignore` má vyloučit bin/obj, Git metadata a tajné soubory.

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY MojeApp.csproj ./
RUN dotnet restore MojeApp.csproj
COPY . ./
RUN dotnet publish MojeApp.csproj --no-restore -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER $APP_UID
COPY --from=build /app/publish ./
ENTRYPOINT ["dotnet", "MojeApp.dll"]
```

`APP_UID` poskytuje zvolená linuxová .NET image pro uživatele bez root oprávnění. Zápis do vlastních adresářů vyžaduje odpovídající práva a svazky. Tag `10.0` se může měnit; pro opakovatelné nasazení připněte konkrétní ověřený digest a plánujte jeho aktualizace.

**Příkazy pro lokální demo** z adresáře projektu, ne produkční nasazení.

```bash
docker build -t moje-app:demo .
docker run --rm -p 127.0.0.1:8080:8080 moje-app:demo
```

### Integrace ve Visual Studiu :id=visual-studio-integrace

IDE může připravit podporu kontejnerů podle instalovaných nástrojů; výsledný build kontext, porty a cílovou image vždy zkontrolujte. U řešení s více projekty je nutné kopírovat také jejich projektové soubory a společné build/NuGet nastavení.

<span id="docker-compose-více-služeb"></span>

### Docker Compose pro více služeb

**Výřez `compose.yaml`** pro API a už připravený databázový image. Vyžaduje doplnění služby `db`, jejího svazku, healthchecku a skutečného přihlašování; není to hotový manifest k nasazení.

```yaml
services:
  api:
    build: .
    ports: ["127.0.0.1:8080:8080"]
    environment:
      ASPNETCORE_HTTP_PORTS: "8080"
      ConnectionStrings__Default: "Server=db;Database=MojeDB;Encrypt=True"
    depends_on:
      db:
        condition: service_healthy
```

Uvnitř sítě Compose je databáze na názvu služby `db`, nikoli na `localhost` API kontejneru. Pořadí startu samo nedokazuje připravenost databáze; aplikace musí zvládat přechodnou nedostupnost i později. Heslo nepatří do YAML; použijte zdroj tajemství podporovaný aplikací. Připojení bez uživatele a hesla vyžaduje zvlášť nakonfigurovanou identitu.

## Kubernetes

Kubernetes řídí požadovaný stav a obnovování kontejnerů v clusteru. Není zárukou bezchybného kódu ani trvalosti dat bez vhodného úložiště.

### Základní pojmy

| Pojem | Význam |
|---|---|
| Pod | Jedna plánovaná jednotka se sdílenou sítí, s jedním či více kontejnery |
| Deployment | Řídí repliky a postupné změny Podů |
| Service | Stabilní síťový přístup k vybraným Podům |
| ConfigMap / Secret | Běžná konfigurace / citlivé hodnoty; base64 není šifrování |

### Manifest Deployment :id=deployment-manifest

**Soubor `deployment.yaml`**, samostatná ilustrace. Registry a image jsou zástupné; Service, oprávnění, síťová pravidla a provozní úložiště nejsou součástí výřezu. Do clusteru jej aplikujete příkazem `kubectl apply -f deployment.yaml`.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: moje-api
spec:
  replicas: 2
  selector:
    matchLabels: { app: moje-api }
  template:
    metadata:
      labels: { app: moje-api }
    spec:
      containers:
        - name: api
          image: registry.example.test/moje-api:1.0.0
          ports: [{ containerPort: 8080 }]
          env:
            - { name: ASPNETCORE_HTTP_PORTS, value: "8080" }
          securityContext:
            runAsNonRoot: true
            allowPrivilegeEscalation: false
          readinessProbe:
            httpGet: { path: /health/ready, port: 8080 }
          livenessProbe:
            httpGet: { path: /health/live, port: 8080 }
          resources:
            requests: { cpu: "100m", memory: "128Mi" }
            limits: { memory: "256Mi" }
```

Hodnoty prostředků jsou ukázkové požadavky, nikoli změřená kapacita. Service může například mapovat svůj port 80 na `targetPort: 8080`; samotné `containerPort` port nepublikuje. Readiness vyřazuje nepřipravený Pod z běžného směrování, liveness po selhání podle pravidel vede k restartu kontejneru. Pro pomalý start zvažte startup probe. [Význam sond](https://kubernetes.io/docs/concepts/workloads/pods/probes/).

<details>
<summary>Volitelné: kontroly zdraví a Helm</summary>

**Celý `Program.cs`** v projektu `dotnet new web -n MojeApp -f net10.0`; spustit jej lze i bez Dockeru.

```csharp
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddHealthChecks();
var app = builder.Build();
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/health/ready");
app.MapGet("/", () => "Aplikace odpovídá.");
app.Run();
```

Obě sondy zde vrátí 200, protože nejsou registrované žádné kontroly závislostí. Pro skutečnou readiness přidejte vhodné kontroly; výpadek externí DB obvykle nemá sám spouštět restart přes liveness. `AddDbContextCheck` či kontrola URL nejsou automaticky součástí každé instalace a potřebují vlastní balíček/implementaci. Helm šablonuje manifesty, neověřuje aplikační připravenost za vás.

</details>
