# Logování a diagnostika

**Příklady:** .NET 10 / C# 14. Samostatné bloky C# jsou jednotlivé náhrady `Program.cs` v projektu `dotnet new console -f net10.0`; potřebné NuGet balíčky uvádí každá ukázka. Bloky nespojujte.

Logy zaznamenávají události a pomáhají hledat příčiny problémů. Volte úroveň podle závažnosti a zapisujte údaje potřebné pro diagnostiku; hesla, tokeny ani celé citlivé požadavky do logu nepatří.

## Vestavěné logování `ILogger` (.NET)

Ukázka potřebuje balíček pro výpis do konzole: `dotnet add package Microsoft.Extensions.Logging.Console`. `ILogger<T>` označuje kategorii typem; v aplikaci jej obvykle dodá [DI](DependencyInjection.md). Zde vlastníme a uvolníme továrnu sami.

```csharp
using Microsoft.Extensions.Logging;
using var factory = LoggerFactory.Create(b => b.AddConsole().SetMinimumLevel(LogLevel.Information));
ILogger<Program> logger = factory.CreateLogger<Program>();
logger.LogInformation("Aplikace spuštěna.");
logger.LogWarning("Nízká kapacita: {Kapacita} MB", 120);
logger.LogError(new InvalidOperationException("Ukázková chyba."),
    "Chyba požadavku {Id}", 42);
```

Konzole obsahuje tyto zprávy a hodnoty; prefixy, barvy a zásobník závisejí na poskytovateli. Úrovně: `Trace`, `Debug`, `Information`, `Warning`, `Error`, `Critical`; `None` vypíná záznamy.

## Konfigurace v `Program.cs`

Ukázka používá obecného hostitele (Generic Host) z balíčku `Microsoft.Extensions.Hosting` (`dotnet add package Microsoft.Extensions.Hosting`). Výchozí hostitel už obsahuje poskytovatele. Vymazání umožní zvolit právě jeden; `AddConsole` bez rozmyslu nepřidávejte opakovaně. Webová aplikace (`WebApplication.CreateBuilder`) nabízí stejné `builder.Logging`.

```csharp
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
var builder = Host.CreateApplicationBuilder(args);
builder.Logging.ClearProviders();
builder.Logging.AddJsonConsole();
builder.Logging.SetMinimumLevel(LogLevel.Information);
using var host = builder.Build();
var logger = host.Services.GetRequiredService<ILogger<Program>>();
logger.LogInformation("Objednávka {OrderId} zpracována.", 17);
```

Výstup poskytovatele je JSON obsahující zprávu a stav s `OrderId = 17`. Hostitel se zde jen sestaví, nespouští se (`host.Run()` by následovalo v běžné službě). Pravidla pro konkrétní kategorii či poskytovatele v konfiguraci mohou přebít obecné minimum.

## Serilog – oblíbená externí knihovna

**Samostatný konzolový projekt s externími balíčky.** Přidejte `Serilog`, `Serilog.Sinks.Console` a `Serilog.Sinks.File` pomocí `dotnet add package <název>`, v reálném projektu připněte zvolené kompatibilní verze. Samotné jádro neobsahuje všechny cíle zápisu. Pro napojení na ASP.NET Core existuje samostatný balíček `Serilog.AspNetCore`.

```csharp
using Serilog;
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .WriteTo.File("log.txt", rollingInterval: RollingInterval.Day)
    .CreateLogger();
try
{
    Log.Information("Start aplikace");
    Log.Error(new InvalidOperationException("Ukázková chyba."), "Operace selhala.");
}
finally { Log.CloseAndFlush(); }
```

Při spuštění zapisuje do konzole i denně děleného souboru v pracovním adresáři. Nastavte retenci a přístupová práva podle provozu; tento příklad hostitele neintegruje.

## `Debug` a `Trace` pro vývoj

`Debug` volání se překládají pod symbolem `DEBUG`, `Trace` pod `TRACE`. Zobrazení záleží také na posluchačích; samotný režim sestavení neurčuje cílové okno.

```csharp
using System.Diagnostics;
using var listener = new ConsoleTraceListener();
Trace.Listeners.Add(listener);
try
{
    Debug.WriteLine("Zpráva pro ladicí výstup.");
    Trace.TraceInformation("Trasovací zpráva.");
    Trace.Flush();
}
finally { Trace.Listeners.Remove(listener); }
```

Při standardním sestavení s `TRACE` konzole obsahuje `Trasovací zpráva.`. Ladicí zpráva nemusí být v konzoli. Pro provozní logování preferujte konfigurovatelné `ILogger`.

<details>
<summary>Volitelné: strukturované logování a OpenTelemetry</summary>

Šablona `Objednávka {OrderId}` předává odděleně text a pojmenované hodnoty. **Strukturované logování neznamená automaticky JSON**: podobu a uložení určuje poskytovatel. Interpolace by z hodnot udělala předem sestavený text.

Argumenty metod se vyhodnotí i při vypnuté úrovni. Drahý výpočet proto chraňte `logger.IsEnabled(LogLevel.Debug)`; samotná šablona jeho spuštění neodloží. Pro velmi častá volání lze použít generování přes `LoggerMessage`.

[OpenTelemetry](https://opentelemetry.io/docs/) propojuje logy, metriky a distribuované trasování; export vyžaduje další konfiguraci. Nejde o náhradu promyšleného obsahu logů. Viz také [dokumentace ILogger](https://learn.microsoft.com/en-us/dotnet/core/extensions/logging).

</details>
