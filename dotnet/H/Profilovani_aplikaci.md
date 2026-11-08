# Profilování aplikací v .NET

Profilování odpovídá na otázku, **kde** aplikace skutečně tráví čas nebo alokuje paměť. Nejdřív změřte reprezentativní scénář, teprve potom optimalizujte a výsledek změřte znovu.

**Prostředí:** .NET 10 / C# 14. Diagnostické nástroje (`dotnet-counters`, `dotnet-trace`, `dotnet-dump`) se instalují zvlášť jako .NET nástroje; jejich výstup a dostupné volby závisí na verzi nástroje i runtime.

## 1. Princip :id=_1-koncept

| Technika | Co odpoví | Typická cena |
|---|---|---|
| **Metriky** (čítače) | Jak se mění souhrnné hodnoty: GC, alokace, fronta ThreadPoolu | Nízká, vhodné i pro provoz |
| **Vzorkování** (sampling) | Které zásobníky volání se v čase nejčastěji objevují | Nízká až střední; jde o statistiku, ne o přesné časy metod |
| **Trasování** (tracing) | Jaké události nastaly a kdy: GC, JIT, výjimky, vlastní aktivity | Podle zapnutých poskytovatelů událostí; může být vysoká |
| **Instrumentace** | Přesné počty a časy vstupů do metod | Vysoká; mění měřený program |
| **Profilování alokací** | Které typy a zásobníky alokují nejvíc | Střední; .NET často jen vzorkuje |
| **Mikrobenchmark** | Kolik stojí izolovaná operace za kontrolovaných podmínek | Nevypovídá o celé aplikaci |

Flame graph je zobrazení vzorků: šířka bloku odpovídá podílu vzorků se stejným zásobníkem, nikoli délce jednoho volání. Vzorky čekajících vláken nejsou spotřeba CPU; nástroj je musí oddělit (CPU time versus thread time).

Měřte build **Release**, s realistickými daty a po zahřátí. Výsledek ovlivňuje JIT a vrstvená kompilace, GC režim, počet jader, kontejnerové limity i souběžné procesy.

## 2. Příklad

### dotnet-counters – průběžné metriky :id=dotnet-counters-live-metriky

**Příkazy pro vlastní běžící proces.** `<pid>` nahraďte ID procesu, případně použijte `--name`.

```bash
dotnet tool install --global dotnet-counters
dotnet-counters ps
dotnet-counters monitor --process-id <pid> --counters System.Runtime
```

Sledujte trend, ne jedno číslo: rostoucí `dotnet.gc.heap.total_allocated` znamená vysokou míru alokací, rostoucí délka fronty ThreadPoolu může znamenat blokovaná vlákna. Univerzální „dobrá“ hodnota neexistuje.

Od .NET 9 runtime publikuje metriky přes `Meter` s názvem `System.Runtime`. Stejná data lze číst i v procesu, například v testu diagnostiky:

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`.

```csharp
using System.Diagnostics.Metrics;

long kolekce = 0;
using var listener = new MeterListener();
listener.InstrumentPublished = (nastroj, l) =>
{
    if (nastroj.Meter.Name == "System.Runtime" && nastroj.Name == "dotnet.gc.collections")
        l.EnableMeasurementEvents(nastroj);
};
// Pozorovatelný čítač vrací kumulativní hodnotu pro každou generaci zvlášť.
listener.SetMeasurementEventCallback<long>((_, hodnota, _, _) => kolekce += hodnota);
listener.Start();

GC.Collect();
listener.RecordObservableInstruments();
Console.WriteLine(kolekce > 0 ? "Metrika dotnet.gc.collections je dostupná." : "Metrika chybí.");
```

Výstup: `Metrika dotnet.gc.collections je dostupná.` Ruční `GC.Collect()` zde pouze zaručí nenulovou hodnotu v ukázce; v aplikaci GC nevynucujte.

### dotnet-trace – zachycení profilu

**Zachycení 30 sekund z běžícího procesu a převod pro prohlížeč flame graphů.** Formát `--duration` je `dd:hh:mm:ss`.

```bash
dotnet tool install --global dotnet-trace
dotnet-trace list-profiles
dotnet-trace collect --process-id <pid> --duration 00:00:00:30 --output trasa.nettrace
dotnet-trace convert trasa.nettrace --format Speedscope
```

Soubor `.nettrace` otevře Visual Studio nebo PerfView. Web speedscope.app potřebuje převedený formát. Trasa může obsahovat názvy typů, cest a další citlivé údaje, nesdílejte ji bez kontroly.

<span id="lokální-profiling-ve-visual-studiu"></span>

### Lokální profilování ve Visual Studiu

**Debug → Performance Profiler** nabízí mimo jiné nástroje **CPU Usage** a **.NET Object Allocation Tracking**. Spusťte konfiguraci Release, proveďte jeden opakovatelný scénář a porovnejte zásobníky s největším podílem. Debugger připojený během měření mění chování; profiler spouštějte bez ladění, pokud to nástroj nabízí.

### Mikrobenchmark až po nalezení místa :id=benchmarkdotnet-mikrobenchmarky

Profil ukáže, **kde** je problém. Mikrobenchmark pak porovná dvě implementace téže izolované operace. Postup, statistika a typické chyby měření jsou v kapitole [BenchmarkDotNet](Benchmarking.md). `Stopwatch` je vhodný pro hrubé měření scénáře, ne pro jemné porovnání krátkých metod.

## 3. Kdy použít

- **dotnet-counters**: první rychlý pohled v testovacím nebo provozním prostředí, ověření hypotézy „roste GC / fronta“.
- **dotnet-trace**: hledání horkých zásobníků, GC pauz nebo JIT během zátěžového testu; zapínejte jen potřebné události.
- **dotnet-dump**: analýza toho, co drží paměť živou (kořeny objektů), a stavu vláken při zamrznutí.
- **Visual Studio / PerfView**: podrobná lokální analýza CPU a alokací.
- **BenchmarkDotNet**: rozhodnutí mezi dvěma implementacemi úzce vymezené operace.

## 4. Časté chyby

- **Profilování konfigurace Debug**: chybí optimalizace JIT a výsledky neodpovídají Release.
- **Optimalizace bez měření**: odhad úzkého hrdla bývá mylný. Změřte a výsledek ověřte stejným scénářem po úpravě.
- **Záměna čekání za CPU**: vlákno blokované na I/O nebo zámku se objevuje ve vzorcích času vláken, ale nespotřebovává CPU.
- **Jediné měření**: rozptyl mezi běhy je běžný. Porovnávejte opakované běhy a stejné prostředí.
- **Příliš mnoho zapnutých událostí**: podrobné trasování samo zpomalí aplikaci a vytvoří obrovský soubor.

---

<details>
<summary>Volitelné podrobnosti: PerfView, kontejnery a průběžná telemetrie</summary>

<span id="perfview-nejvýkonnější-bezplatný-nástroj"></span>

### PerfView – podrobná analýza na Windows

PerfView sbírá ETW události (Event Tracing for Windows) z runtime i operačního systému a otevírá také `.nettrace`. Pohledy **GCStats**, **CPU Stacks** a **Thread Time** pomohou oddělit GC pauzy, výpočet a čekání. Nástroj vyžaduje Windows a pro sběr ETW obvykle oprávnění správce.

**Příkazy PerfView na Windows.**

```powershell
PerfView.exe /GCCollectOnly /AcceptEULA collect
PerfView.exe /ThreadTime collect
```

### Profilování v Kubernetes

**Předpokládá, že kontejner obsahuje `dotnet-trace` a zapisovatelný `/tmp`.** Cílový proces nemusí mít PID 1; ověřte jej přes `dotnet-trace ps` v kontejneru.

```bash
kubectl exec <pod> -- dotnet-trace collect --process-id 1 --duration 00:00:00:30 --output /tmp/trasa.nettrace
kubectl cp <pod>:/tmp/trasa.nettrace ./trasa.nettrace
```

Nástroj komunikuje s runtime přes diagnostický IPC soket (Inter-Process Communication, komunikace mezi procesy) v dočasném adresáři. V oddělených kontejnerech (sidecar) musí být tento adresář sdílený. Alternativou je služba `dotnet-monitor`.

### OpenTelemetry a runtime metriky :id=application-insights-opentelemetry

**Fragment `Program.cs` v ASP.NET Core s balíčky OpenTelemetry.Extensions.Hosting a OpenTelemetry.Exporter.OpenTelemetryProtocol.** Cíl exportu (collector, Azure Monitor) se nastavuje mimo kód.

```csharp
builder.Services.AddOpenTelemetry()
    .WithMetrics(metriky => metriky
        .AddMeter("System.Runtime")                    // vestavěné metriky runtime od .NET 9
        .AddMeter("Microsoft.AspNetCore.Hosting")
        .AddOtlpExporter());
```

Upozornění nastavujte na trend `dotnet.gc.collections` (atribut generace) nebo `dotnet.gc.heap.total_allocated` vůči vlastní referenční hodnotě. Kardinalitu atributů držte nízkou. Přehled výše: [Pozorovatelnost](../F/Observability.md).

</details>

Související: [BenchmarkDotNet](Benchmarking.md), [správa paměti](Sprava_pameti.md), [ThreadPool](Prepinani_vlaken.md).
