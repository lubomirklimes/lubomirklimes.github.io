# Správa paměti a Garbage Collection v .NET

Garbage Collector (GC) uvolňuje **spravovanou paměť** objektů, na které už nevede žádná živá reference. Neuvolňuje nativní prostředky (soubory, sokety, nativní paměť) v okamžiku, kdy je přestanete potřebovat; o ty se stará `Dispose`. Výkonové problémy vznikají hlavně z vysoké míry alokací, objektů, které zbytečně přežívají, a velkých bufferů.

**Prostředí:** .NET 10 / C# 14. Chování GC (heuristiky, výchozí režimy, limity v kontejneru) se mezi verzemi runtime liší; níže je uvedeno, kde na verzi záleží.

## 1. Princip :id=_1-koncept

### Generační model

| Oblast | Co tam patří | Poznámka |
|---|---|---|
| **Gen 0** | Nově alokované objekty | Sbírá se nejčastěji a nejlevněji |
| **Gen 1** | Objekty, které přežily Gen 0 | Mezistupeň |
| **Gen 2** | Dlouho žijící objekty | Úplná kolekce je nejdražší |
| **LOH** (Large Object Heap) | Objekty od 85 000 bajtů včetně režie (typicky velká pole) | Sbírá se s Gen 2, ve výchozím stavu se nekompaktuje |
| **POH** (Pinned Object Heap) | Pole alokovaná jako trvale připnutá (.NET 5+) | Nebrání kompakci ostatních oblastí |

Většina objektů má zaniknout brzy, ještě v Gen 0. Objekt, který přežije, se při kompakci přesouvá; **připnutý** objekt (pinned, například přes `fixed`) přesunout nelze, a pokud je připnutí dlouhé, fragmentuje haldu.

Hodnotový typ (`struct`) neleží „vždy na zásobníku“: lokální proměnná může být v registru nebo na zásobníku, ale `struct` jako pole třídy nebo prvek pole leží uvnitř objektu na haldě.

### Server GC vs Workstation GC

- **Workstation GC**: méně GC vláken a menší paměť; výchozí pro konzolové a desktopové aplikace.
- **Server GC**: halda a GC vlákno na logický procesor, vyšší propustnost za cenu paměti; výchozí pro projekty ASP.NET Core. Od .NET 9 je se Server GC výchozí **DATAS** (Dynamic Adaptation To Application Sizes), které velikost haldy přizpůsobuje zátěži.
- **Background GC** (souběžná kolekce Gen 2) je v obou režimech zapnutá ve výchozím stavu.

## 2. Příklad

### Identifikace problémů – co sledovat

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`. Vypsané hodnoty se liší podle stroje a běhu.

```csharp
GCMemoryInfo info = GC.GetGCMemoryInfo();
Console.WriteLine($"Kolekce Gen 0/1/2: {GC.CollectionCount(0)}/{GC.CollectionCount(1)}/{GC.CollectionCount(2)}");
Console.WriteLine($"Alokováno celkem: {GC.GetTotalAllocatedBytes() / 1024} KiB");
Console.WriteLine($"Halda po poslední kolekci: {info.HeapSizeBytes / 1024} KiB, fragmentace {info.FragmentedBytes / 1024} KiB");
Console.WriteLine($"Server GC: {System.Runtime.GCSettings.IsServerGC}");
```

V provozu stejné údaje čtěte jako metriky (`dotnet-counters`, OpenTelemetry), ne výpisem. Rozhodující je trend a souvislost s latencí; „správný“ počet kolekcí za minutu obecně neexistuje.

### Event handler drží odběratele

Událost uchovává delegáta a ten referenci na objekt odběratele. Dokud žije **vydavatel**, žije i přihlášený odběratel. Typický únik vzniká, když se krátce žijící objekt přihlásí ke statické nebo dlouho žijící události.

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`. Vynucené `GC.Collect()` slouží jen k demonstraci dosažitelnosti.

```csharp
using System.Runtime.CompilerServices;

var vydavatel = new Vydavatel();
WeakReference prihlaseny = Vytvor(vydavatel, odhlasit: false);
WeakReference odhlaseny = Vytvor(vydavatel, odhlasit: true);

GC.Collect();
GC.WaitForPendingFinalizers();
GC.Collect();

Console.WriteLine($"Přihlášený odběratel žije: {prihlaseny.IsAlive}");
Console.WriteLine($"Odhlášený odběratel žije: {odhlaseny.IsAlive}");
GC.KeepAlive(vydavatel);

// Samostatná metoda zajistí, že odběratele nedrží lokální proměnná volajícího.
[MethodImpl(MethodImplOptions.NoInlining)]
static WeakReference Vytvor(Vydavatel vydavatel, bool odhlasit)
{
    var odberatel = new Odberatel();
    vydavatel.Zmena += odberatel.Reaguj;
    if (odhlasit) vydavatel.Zmena -= odberatel.Reaguj;
    return new WeakReference(odberatel);
}

class Vydavatel
{
    public event EventHandler? Zmena;
    public void Oznam() => Zmena?.Invoke(this, EventArgs.Empty);
}
class Odberatel { public void Reaguj(object? sender, EventArgs e) { } }
```

Výstup: `Přihlášený odběratel žije: True` a `Odhlášený odběratel žije: False`.

### Snižování alokací – pooling

Pro dočasné buffery na horké cestě lze pole půjčovat z `ArrayPool<T>.Shared` místo opakovaného `new`. Pooling přináší pravidla vlastnictví a vrácení; podrobnosti v [ArrayPool](ArrayPool.md). Pohledy bez kopírování popisuje [Span a Memory](Span_Memory.md).

### Správné nakládání s IDisposable

`Dispose` deterministicky uvolní nativní prostředek, GC tím nespouští. Nativní handle obalte do `SafeHandle`; vlastník pak nepotřebuje vlastní finalizer, protože `SafeHandle` má spolehlivý finalizer jako pojistku.

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`. Nativní paměť zde zastupuje skutečný systémový prostředek.

```csharp
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

NativniBuffer handle;
using (var zdroj = new Zdroj(1024))
{
    handle = zdroj.Handle;
    Console.WriteLine($"Platný: {!handle.IsInvalid}");
}
Console.WriteLine($"Uzavřený po Dispose: {handle.IsClosed}");

public sealed class Zdroj(int velikost) : IDisposable
{
    public NativniBuffer Handle { get; } = new(velikost);
    public void Dispose() => Handle.Dispose(); // Opakované volání je bezpečné.
}

public sealed class NativniBuffer : SafeHandleZeroOrMinusOneIsInvalid
{
    public NativniBuffer(int velikost) : base(ownsHandle: true) => SetHandle(Marshal.AllocHGlobal(velikost));
    protected override bool ReleaseHandle()
    {
        Marshal.FreeHGlobal(handle);
        return true;
    }
}
```

Výstup: `Platný: True` a `Uzavřený po Dispose: True`. Spravovaná paměť objektu `Zdroj` se uvolní až při některé další kolekci.

### LOH – vyhýbejte se velkým krátkodobým alokacím

**Metody služby; `Polozka` je vlastní typ.**

```csharp
// Celý JSON jako jeden řetězec: u velkých dat vznikne objekt na LOH.
public string Serializuj(List<Polozka> polozky) => JsonSerializer.Serialize(polozky);

// Zápis přímo do proudu používá menší průběžně vyprazdňované buffery.
public Task SerializujAsync(List<Polozka> polozky, Stream vystup, CancellationToken ct)
    => JsonSerializer.SerializeAsync(vystup, polozky, cancellationToken: ct);
```

## 3. Kdy se zaměřit na GC optimalizaci

- Profil nebo metriky ukazují významný čas v GC či vysokou míru alokací na horké cestě.
- Latence P99 (99. percentil, tedy nejpomalejší 1 % požadavků) koreluje s kolekcemi Gen 2.
- Paměť po kolekcích trvale roste: hledejte objekty, které něco drží živé (cache, statické kolekce, události, časovače).
- Aplikace pracuje s velkými buffery a v trase vidíte LOH alokace.

## 4. Časté chyby

- **Statické nebo neomezené kolekce**: vše, co obsahují, žije stejně dlouho jako proces.
- **Neodhlášené události a časovače**: dlouho žijící vydavatel drží odběratele; odhlaste se, nebo vazbu navrhněte opačně.
- **`GC.Collect()` v aplikačním kódu**: ruší heuristiky GC a obvykle škodí; výjimkou jsou diagnostika a testy.
- **Záměna `Dispose` a uvolnění paměti**: `using` uvolní nativní prostředek, spravovanou paměť později sebere GC.
- **Dlouhé připínání**: `fixed` a `GCHandle.Alloc(..., Pinned)` držte co nejkratší dobu; trvale připnutá pole alokujte přes `GC.AllocateArray<T>(n, pinned: true)` na POH.

---

<details>
<summary>Volitelné podrobnosti: konfigurace GC, kompakce LOH a diagnostika</summary>

### Konfigurace GC v runtimeconfig.json

**Soubor `runtimeconfig.template.json`** vedle projektu; build z něj vytvoří sekci `runtimeOptions.configProperties` ve výsledném `*.runtimeconfig.json`.

```json
{
  "configProperties": {
    "System.GC.Server": true,
    "System.GC.Concurrent": true
  }
}
```

Stejné volby nastavíte i vlastnostmi projektu (`<ServerGarbageCollection>true</ServerGarbageCollection>`) nebo proměnnými prostředí `DOTNET_gcServer`. V kontejneru s paměťovým limitem GC limit rozpozná a ve výchozím stavu omezí haldu na část limitu (75 %). Explicitní `System.GC.HeapHardLimit` nastavujte jen s důvodem a měřením.

### Manuální kompakce LOH

**Jednorázová kompakce, například po uvolnění velké datové struktury.**

```csharp
System.Runtime.GCSettings.LargeObjectHeapCompactionMode = System.Runtime.GCLargeObjectHeapCompactionMode.CompactOnce;
GC.Collect(); // Výjimečný případ; blokující a drahá operace.
```

### Diagnostické nástroje

| Nástroj | Použití |
|---|---|
| `dotnet-counters` | Průběžné metriky GC, alokací a haldy |
| `dotnet-gcdump` | Lehký snímek spravované haldy pro analýzu typů |
| `dotnet-dump` | Úplný výpis paměti procesu včetně kořenů objektů |
| `dotnet-trace` | Události GC a vzorky alokací |
| PerfView, Visual Studio | Podrobná analýza GC a alokací |

**Příkazy pro běžící proces.**

```bash
dotnet-counters monitor --process-id <pid> --counters System.Runtime
dotnet-dump collect --process-id <pid> --output pamet.dmp
dotnet-dump analyze pamet.dmp
```

V interaktivním režimu `dotnet-dump analyze` ukáže `dumpheap -stat` počty a velikosti typů a `gcroot <adresa>` cestu, která objekt drží živý. Výpis paměti obsahuje data aplikace včetně tajných hodnot; chraňte jej.

### Proč objekty přežívají do Gen 2 :id=generational-aware-analysis

Trasa s událostmi GC ukáže důvod a typ kolekcí:

**Sběr událostí GC; profil `gc-verbose` přidá i vzorky alokací.**

```bash
dotnet-trace collect --process-id <pid> --profile gc-verbose
```

Hledejte objekty, které zbytečně přežívají: cache bez expirace, statické slovníky, zapomenuté události, dlouhé řetězy `async` čekání držící velké lokální proměnné.

</details>
