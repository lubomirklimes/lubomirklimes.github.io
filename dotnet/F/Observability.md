# Pozorovatelnost: logy, metriky a trasování :id=observability-logging-metrics-tracing

Pozorovatelnost umožňuje odvozovat stav aplikace z jejích výstupů. Log popisuje událost, metrika agregované měření a distribuovaná stopa související operace napříč službami. Příklady cílí na .NET 10 / C# 14; OpenTelemetry má vlastní balíčky a verze.

## 1. Princip :id=_1-koncept

| Signál | Příklad a význam |
|---|---|
| Log | Chyba konkrétní operace s úrovní a strukturovanými hodnotami |
| Metrika | Počet požadavků za sekundu (RPS), délka fronty nebo rozdělení dob |
| Stopa | Trace ID spojuje dílčí operace, span zachycuje jednu z nich |

P99 je 99. percentil, nikoli průměrná doba. OpenTelemetry (OTel) sjednocuje sběr a export, samo neurčuje, které údaje jsou bezpečné nebo zda je backend opravdu přijal. Vzorkování omezuje počet stop; nezachytí každou událost a nemusí řešit objem metrik/logů stejným způsobem.

## 2. Příklad

<span id="strukturované-logování-se-serilog"></span>

### Strukturované logování

**Samostatný `Program.cs`** konzolového projektu `dotnet new console -f net10.0` s balíčkem `Microsoft.Extensions.Logging.Console` (`dotnet add package Microsoft.Extensions.Logging.Console`). JSON je volba poskytovatele; strukturovaná šablona uchovává pojmenované hodnoty i pro jiné poskytovatele.

```csharp
using Microsoft.Extensions.Logging;
using var factory = LoggerFactory.Create(b => b.AddJsonConsole());
var logger = factory.CreateLogger("Objednavky");
logger.LogInformation("Objednávka {ObjednavkaId} byla přijata.", 42);
```

Výstup JSON obsahuje zprávu a číselný `ObjednavkaId=42`; diakritika může být escapována. Serilog je volitelný poskytovatel s dalšími sinks (cíli zápisu), vyžaduje odpovídající balíčky; samostatný příklad viz [logování](../C/Logging.md). Drahé argumenty se počítají i při vypnuté úrovni, pokud je nechráníte vhodným pravidlem.

### OpenTelemetry – registrace všech signálů :id=opentelemetry-logy-metriky-tracing

**Fragment** před `Build()` webového hostitele s balíčky `OpenTelemetry.Extensions.Hosting`, `OpenTelemetry.Exporter.OpenTelemetryProtocol` a instrumentacemi `OpenTelemetry.Instrumentation.AspNetCore`, `.Http` a `.Runtime`. Vyžaduje importy `OpenTelemetry.Resources`, `OpenTelemetry.Trace`, `OpenTelemetry.Metrics` a `OpenTelemetry.Logs`. Export potřebuje běžící OTLP collector, například lokálně na loopbacku.

```csharp
builder.Services.AddOpenTelemetry()
    .ConfigureResource(r => r.AddService("MojeApp"))
    .WithTracing(t => t.AddSource("MojeApp")
        .AddAspNetCoreInstrumentation().AddHttpClientInstrumentation().AddOtlpExporter())
    .WithMetrics(m => m.AddMeter("MojeApp.Objednavky")
        .AddAspNetCoreInstrumentation().AddRuntimeInstrumentation().AddOtlpExporter());
builder.Logging.AddOpenTelemetry(o =>
{
    o.IncludeScopes = true;
    o.IncludeFormattedMessage = true;
    o.AddOtlpExporter();
});
```

OTLP je přenosový protokol telemetrie; endpoint, protokol a přihlášení nastavte podle collectoru, například přes podporované `OTEL_EXPORTER_OTLP_*` proměnné. `WithTracing`/`WithMetrics` **nezapínají export logů**, proto je registrace logování samostatná. Vlastní Meter a ActivitySource je nutné také přihlásit jménem přes AddMeter/AddSource. [OTel pro .NET](https://opentelemetry.io/docs/languages/dotnet/).

### Vlastní metrika

**Samostatný konzolový `Program.cs`** bez balíčků OpenTelemetry. Místní `MeterListener` zachytí měření přímo v procesu; nejde o export do monitorovací služby ani benchmark.

```csharp
using System.Diagnostics.Metrics;
long soucet = 0;
using var listener = new MeterListener();
listener.InstrumentPublished = (instrument, l) =>
{
    if (instrument.Meter.Name == "MojeApp.Objednavky") l.EnableMeasurementEvents(instrument);
};
listener.SetMeasurementEventCallback<long>((instrument, value, tags, state) => soucet += value);
listener.Start();
using var meter = new Meter("MojeApp.Objednavky");
var pocet = meter.CreateCounter<long>("objednavky.celkem", "{order}");
pocet.Add(1);
pocet.Add(2);
Console.WriteLine($"Přijato měřením: {soucet}");
```

Výstup: `Přijato měřením: 3`. Doby zaznamenávejte přes Histogram se správnou jednotkou, z měření skutečných operací. ID uživatele nebo objednávky jako metrické dimenze vytvářejí příliš mnoho různých řad (vysokou kardinalitu).

<span id="vlastní-activity-span"></span>

### Vlastní Activity jako span

**Samostatný konzolový `Program.cs`.** Explicitní listener zde zastupuje odběratele, kterého by jinak zaregistrovalo OpenTelemetry; v produkci jej nepotřebujete.

```csharp
using System.Diagnostics;
using var source = new ActivitySource("MojeApp");
using var listener = new ActivityListener
{
    ShouldListenTo = s => s.Name == "MojeApp",
    Sample = (ref ActivityCreationOptions<ActivityContext> options) => ActivitySamplingResult.AllDataAndRecorded,
    ActivityStopped = a => Console.WriteLine($"Operace: {a.OperationName}, stav: {a.Status}")
};
ActivitySource.AddActivityListener(listener);
using (var activity = source.StartActivity("ZpracujObjednavku"))
{
    activity?.SetTag("ukazka", true);
    activity?.SetStatus(ActivityStatusCode.Ok);
}
using var bezOdberatele = new ActivitySource("Vypnuto");
Console.WriteLine(bezOdberatele.StartActivity("Operace") is null
    ? "Bez odběratele nevznikla Activity." : "Activity vznikla.");
```

Výstup: `Operace: ZpracujObjednavku, stav: Ok` a `Bez odběratele nevznikla Activity.`. `StartActivity` může vrátit null, proto jsou volání podmíněná. Korelace přes HTTP funguje podle aktivní instrumentace a propagace kontextu, není zaručena jen existencí typu Activity.

## 3. Kdy použít

Vyberte signály podle otázek, které potřebujete zodpovědět. Úroveň Information může být v provozu správná pro důležité události; univerzální přepnutí všeho na Warning by je skrylo. Řiďte úrovně podle kategorií, nákladů a citlivosti a ověřte skutečný příjem v backendu.

## 4. Časté chyby

- Mít nakonfigurovaný exporter, ale nezaregistrovaný vlastní Meter/ActivitySource.
- Posílat tokeny, hesla, osobní údaje nebo celé request body do logů a tagů; maskování až v UI backendu přichází pozdě.
- Očekávat, že sampling opraví metriky s neomezenými identifikátory v tagu.
- Považovat lokální výpis či úspěšný start SDK za důkaz doručení telemetrie do cloudu.
