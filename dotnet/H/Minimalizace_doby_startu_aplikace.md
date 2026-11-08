# Minimalizace doby startu aplikace a warm-up

Doba startu je čas od spuštění procesu do chvíle, kdy aplikace dokáže **správně** obsloužit první požadavek. Rozhoduje při škálování, nasazení nových verzí a u funkcí s cold startem. Zahřátí (warm-up) je příprava, která proběhne dřív, než aplikace začne přijímat provoz.

**Prostředí:** .NET 10 / C# 14, ASP.NET Core. Kolik který krok ušetří, závisí na aplikaci, hardwaru i hostiteli; obecně platná čísla proto kapitola neuvádí.

## 1. Princip :id=_1-koncept

### Co zabírá čas při startu .NET aplikace

1. **Spuštění runtime a načtení sestavení** (assembly): u framework-dependent aplikace i nalezení sdíleného runtime.
2. **JIT kompilace**: metoda se překládá při prvním volání. Vrstvená kompilace nejprve vytvoří rychle přeložený kód a horké metody později přeloží znovu s optimalizací.
3. **Sestavení hostitele a DI**: registrace služeb, čtení konfigurace, `ValidateOnBuild` v prostředí Development.
4. **Spuštění hostovaných služeb** a otevření naslouchajících portů.
5. **První skutečné operace**: připojení k databázi, kompilace dotazů, naplnění cache, TLS handshake.

Funkce v bezserverovém prostředí se nespouští při každém požadavku, ale při vytvoření nové instance (cold start). Instance pak obvykle obslouží řadu požadavků.

## 2. Příklad

<span id="readytorun-zkrácení-jit-startup"></span>

### ReadyToRun – méně JIT při startu

**Vlastnost projektu a publikace pro zvolený RID.**

```xml
<PropertyGroup>
  <PublishReadyToRun>true</PublishReadyToRun>
</PropertyGroup>
```

```bash
dotnet publish -c Release -r linux-x64
```

ReadyToRun (R2R) uloží do sestavení předem přeložený nativní kód. Při startu se méně metod překládá JITem, ale soubory jsou větší a horké metody může runtime později přeložit znovu kvalitněji. R2R vyžaduje zadaný Runtime Identifier (RID); funguje i bez `--self-contained`. Přínos ověřte měřením vlastní aplikace.

<span id="trimming-menší-assembly-rychlejší-načítání"></span>

### Trimming – menší výstup, ne automaticky rychlejší start

**Vlastnost projektu; trimming je dostupný pro self-contained publikaci.**

```xml
<PropertyGroup>
  <PublishTrimmed>true</PublishTrimmed>
</PropertyGroup>
```

Trimmer odstraní kód, na který nenajde statickou referenci. Hlavním přínosem je velikost výstupu; dopad na start bývá menší a není zaručený. Reflexe, dynamické načítání a některé serializéry mohou po trimmingu selhat. Varování IL2xxx berte jako chyby kompatibility a otestujte publikovaný výstup, ne jen `dotnet run`.

### Lazy inicializace závislostí

DI vytváří singleton až při prvním vyžádání, ne při registraci. Problém nastává, když drahou službu vyžaduje už konstruktor jiné služby, ačkoli ji většina požadavků nepoužije:

**Fragment `Program.cs` minimal API; `TezkaSluzba` je vlastní typ.**

```csharp
builder.Services.AddSingleton<TezkaSluzba>();
builder.Services.AddSingleton(sp => new Lazy<TezkaSluzba>(sp.GetRequiredService<TezkaSluzba>));

app.MapGet("/report", async (Lazy<TezkaSluzba> sluzba, CancellationToken ct) =>
    Results.Ok(await sluzba.Value.VytvorReportAsync(ct))); // Vytvoření až zde.
```

Odložení přesune čekání na první požadavek, který službu potřebuje. U služby nutné pro každý požadavek je lepší ji připravit při warm-upu.

<span id="ihostedservice-warm-up-před-přijetím-requestů"></span>

### Warm-up na pozadí a stav připravenosti

`IHostedService.StartAsync` se dokončí dřív, než hostitel začne přijímat požadavky. Dlouhá práce v něm proto zdrží i odpověď liveness sondy. Následující vzor nechá aplikaci odpovídat a připravenost hlásí zvlášť:

**Samostatný `Program.cs`** webového projektu `dotnet new web -f net10.0`. `/health/live` vrací 200 hned, `/health/ready` vrací 503, dokud warm-up neskončí, a potom 200. Warm-up zde jen čeká 200 ms; v aplikaci jej nahraďte skutečnou přípravou.

```csharp
using Microsoft.Extensions.Diagnostics.HealthChecks;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<StavPripravenosti>();
builder.Services.AddHostedService<ZahrivaciSluzba>();
builder.Services.AddHealthChecks().AddCheck<PripravenostCheck>("warmup", tags: ["ready"]);

var app = builder.Build();
app.MapHealthChecks("/health/live", new() { Predicate = _ => false }); // Žádné kontroly závislostí.
app.MapHealthChecks("/health/ready", new() { Predicate = c => c.Tags.Contains("ready") });
app.MapGet("/", () => "Ahoj");
app.Run();

public sealed class StavPripravenosti
{
    private volatile bool _pripraveno;
    public bool JePripraveno => _pripraveno;
    public void OznacPripraveno() => _pripraveno = true;
}

public sealed class ZahrivaciSluzba(StavPripravenosti stav, ILogger<ZahrivaciSluzba> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await ZahrejAsync(stoppingToken);
        stav.OznacPripraveno();
        log.LogInformation("Warm-up dokončen.");
    }

    // Zde patří skutečná příprava, například první dotaz do databáze nebo naplnění cache.
    private static Task ZahrejAsync(CancellationToken ct) => Task.Delay(TimeSpan.FromMilliseconds(200), ct);
}

public sealed class PripravenostCheck(StavPripravenosti stav) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken ct = default)
        => Task.FromResult(stav.JePripraveno
            ? HealthCheckResult.Healthy()
            : HealthCheckResult.Unhealthy("Warm-up ještě neskončil."));
}
```

Pokud warm-up selže výjimkou, `BackgroundService` ve výchozím nastavení (od .NET 6) zastaví hostitele. Rozhodněte vědomě, zda má aplikace skončit, nebo zůstat nepřipravená a zkoušet znovu.

<span id="health-check-load-balancer-nesmí-posílat-provoz-před-warm-upem"></span>

### Readiness sonda – provoz až po warm-upu

Load balancer nebo Kubernetes `readinessProbe` má volat `/health/ready`; `livenessProbe` jen `/health/live`. Liveness nesmí záviset na databázi, jinak výpadek závislosti způsobí zbytečné restarty. Podrobněji: [Docker a Kubernetes](../F/Docker_Kubernetes.md).

## 3. Kdy použít

- **ReadyToRun**: aplikace, kde naměřený JIT při startu tvoří významnou část doby do připravenosti.
- **Native AOT**: nástroje a služby s krátkým životem, které splní omezení AOT (viz [JIT a AOT](JIT_AOT.md)).
- **Odložená inicializace**: drahé závislosti, které většina požadavků nepoužívá.
- **Warm-up se stavem připravenosti**: aplikace za load balancerem nebo v orchestraci, kde první požadavky nesmí narazit na nepřipravené závislosti.
- **Trimming**: self-contained výstup, kde záleží na velikosti a knihovny jsou kompatibilní.

## 4. Časté chyby

- **Blokující inicializace v konstruktoru singletonu**: `.Result` nebo synchronní I/O v konstruktoru zdrží první resolve a skrývá chyby. Asynchronní přípravu dělejte v hostované službě.
- **Readiness bez skutečného stavu**: sonda, která vrací 200 vždy, nic nechrání.
- **Trimming ověřený jen v Debug**: chyby se projeví až v publikovaném výstupu.
- **Měření `dotnet run`**: zahrnuje build a spuštění SDK. Měřte publikovanou aplikaci až do připravenosti.

---

<details>
<summary>Volitelné podrobnosti: měření doby startu a závislosti</summary>

<span id="měření-startup-time"></span>

### Měření doby startu

**Měření publikované aplikace.** Doba do připravenosti je čas od spuštění procesu do první odpovědi 200 z `/health/ready`; měřte opakovaně a se studenou i teplou cache disku.

```bash
dotnet publish -c Release -r linux-x64 -o ./publish
dotnet-trace collect --output start.nettrace -- ./publish/MojeAplikace
```

`dotnet-trace collect -- <příkaz>` spustí proces a sbírá události od začátku, včetně načítání sestavení a JIT. Trasování samo start zpomaluje, slouží k nalezení příčin, ne jako výsledné číslo.

### Trasování startu v ASP.NET Core :id=startup-tracing-v-aspnet-core

Vlastní značky času jsou často užitečnější než podrobné logy frameworku. `IHostApplicationLifetime.ApplicationStarted` nastane po spuštění serveru; okamžik připravenosti zalogujte zvlášť ve warm-up službě. Úrovně `Debug` pro `Microsoft.AspNetCore.Hosting` vypisují průběh, ale nejsou profilerem jednotlivých fází.

### Vliv počtu NuGet balíčků

Každé načtené sestavení něco stojí, ale cena se liší podle velikosti, inicializace a toho, zda se vůbec načte. Přehled přímých i tranzitivních závislostí:

**Příkaz v adresáři projektu.**

```bash
dotnet list package --include-transitive
```

Rozhodujte podle trasy startu: odstraňte závislost, jejíž inicializace se v ní skutečně objeví, nebo ji načtěte až při použití.

</details>
