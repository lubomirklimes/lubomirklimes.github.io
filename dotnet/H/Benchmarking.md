# BenchmarkDotNet

BenchmarkDotNet je knihovna pro **mikrobenchmarky**: opakovaně měří izolovanou operaci, provede zahřátí, odhadne počet volání na iteraci a vypíše statistiku. Neodpovídá na otázku, proč je pomalá celá aplikace; k tomu slouží [profilování](Profilovani_aplikaci.md).

**Prostředí:** .NET 10 / C# 14, balíček `BenchmarkDotNet` řady 0.15.x (ukázka používá 0.15.8); podporu .NET 10 přinesla řada 0.15. Verzi balíčku v projektu připněte, aby šly výsledky porovnat.

## 1. Princip :id=_1-koncept

Ruční `Stopwatch` kolem krátké metody měří i JIT, nezahřáté cache, GC z jiné části programu a rozlišení časovače. BenchmarkDotNet tyto vlivy omezuje, ale neodstraní:

- **Pilot a zahřátí**: určí počet volání na iteraci a nechá proběhnout JIT včetně vrstvené kompilace (tiered compilation).
- **Izolace**: každý benchmark ve výchozím nastavení běží v samostatném procesu sestaveném v Release.
- **Statistika**: průměr, medián, směrodatná odchylka a poměr k baseline.
- **Diagnostika**: `[MemoryDiagnoser]` přidá alokace na operaci a počty GC.

Číslo platí pro konkrétní hardware, OS, runtime, nastavení GC a vstupní data. Porovnávejte jen výsledky ze stejného prostředí.

## 2. Příklad

### Základní benchmark

**Samostatný `Program.cs`** v konzolovém projektu `net10.0` s balíčkem BenchmarkDotNet. Všechny tři metody vracejí pro každý parametr stejný řetězec, takže porovnávají stejnou práci. Konkrétní čísla kapitola neuvádí: závisí na stroji a runtime, změřte je sami podle části Spuštění.

```csharp
using System.Text;
using BenchmarkDotNet.Attributes;
using BenchmarkDotNet.Running;

BenchmarkRunner.Run<SpojovaniBenchmark>();

[MemoryDiagnoser]
public class SpojovaniBenchmark
{
    [Params(10, 1_000)]
    public int Pocet;

    private string[] _slova = [];

    // Vstup vzniká mimo měření; konstanta by umožnila JIT část práce předpočítat.
    [GlobalSetup]
    public void Priprav() => _slova = Enumerable.Range(0, Pocet).Select(i => $"s{i}").ToArray();

    [Benchmark(Baseline = true)]
    public string Plus()
    {
        string vysledek = "";
        foreach (string s in _slova) vysledek += s;
        return vysledek; // Návratovou hodnotu knihovna spotřebuje, výpočet nelze vyřadit.
    }

    [Benchmark]
    public string Builder()
    {
        var sb = new StringBuilder();
        foreach (string s in _slova) sb.Append(s);
        return sb.ToString();
    }

    [Benchmark]
    public string Concat() => string.Concat(_slova);
}
```

Typy jsou za top-level příkazy, jak C# vyžaduje. Tabulka výsledků obsahuje sloupce `Mean`, `Ratio` a z diagnostiky `Allocated`.

### Parametrizace s [Params]

`[Params]` spustí každou metodu pro všechny uvedené hodnoty. Pomůže najít bod zlomu: u deseti řetězců může být rozdíl zanedbatelný, u tisíců výrazný. Vstupy připravte v `[GlobalSetup]`, aby nebyly součástí měření. `[IterationSetup]` použijte jen při nutnosti: vynutí jediné volání na iteraci, takže u velmi krátkých operací měření zkresluje.

<span id="porovnání-verzí-baseline"></span>

### Baseline a ekvivalentní práce

`Baseline = true` určí metodu, vůči které se počítá `Ratio`. Poměr má smysl jen u metod se **stejným vstupem a stejným výsledkem**. Serializace a deserializace nejsou dvě varianty jedné operace; porovnání serializérů musí použít stejný směr, typ, nastavení i velikost dat.

U operace kratší než několik nanosekund lze ve smyčce provést více opakování a nahlásit je knihovně:

**Metoda uvnitř třídy benchmarku; `_data` je pole připravené v setupu.**

```csharp
[Benchmark(OperationsPerInvoke = 16)]
public int SoucetSestnacti()
{
    int soucet = 0;
    for (int i = 0; i < 16; i++) soucet += _data[i];
    return soucet;
}
```

`OperationsPerInvoke` je vlastnost atributu `[Benchmark]`, ne samostatný atribut. Výsledný čas je vydělen počtem opakování.

### Spuštění

**Příkazy z adresáře projektu.**

```bash
dotnet add package BenchmarkDotNet --version 0.15.8
dotnet run -c Release
```

Výsledky a exporty vzniknou v `BenchmarkDotNet.Artifacts`. Spouštějte bez připojeného debuggeru, na co nejklidnějším stroji a s napájením bez úsporného režimu.

## 3. Kdy použít

- **Rozhodnutí mezi implementacemi** izolované operace, kterou profil označil jako významnou.
- **Ověření optimalizace**: stejný benchmark před změnou a po ní, na stejném stroji.
- **Regresní hlídání**: exportované výsledky lze porovnávat v CI, pokud je běhové prostředí stabilní. Sdílené agenty mají velký rozptyl; sledujte spíše výrazné změny než jednotky procent.

Pro odezvu celé služby pod zátěží použijte zátěžový test (například k6 nebo NBomber) a metriky aplikace.

## 4. Časté chyby

- **Konfigurace Debug nebo připojený debugger**: knihovna na to upozorní a výsledky nejsou použitelné.
- **Vyřazení mrtvého kódu**: výsledek, který se nikde nepoužije, může JIT odstranit. Vracejte hodnotu z metody.
- **Konstantní vstupy**: výraz z konstant může být spočítán předem. Data připravte v setupu.
- **Nesrovnatelné metody**: rozdílné vstupy, výstupy nebo vedlejší efekty dělají `Ratio` bezvýznamným.
- **Závěr z jednoho stroje**: výsledek je měření jednoho prostředí, ne obecná vlastnost API.

<details>
<summary>Volitelné podrobnosti: průběh měření, statistika a exporty</summary>

### Životní cyklus měření

Ve výchozím nastavení BenchmarkDotNet vygeneruje a sestaví pomocný projekt, spustí jej v samostatném procesu a postupně provede fáze **Overhead**, **Pilot**, **Warmup** a **Workload**. Výsledky předá zpět hostitelskému procesu. Režim InProcess je rychlejší, ale méně izoluje.

### Statistika výsledků

- **Mean** je aritmetický průměr, **Median** je méně citlivý na odlehlé hodnoty.
- **StdDev** a **Error** ukazují rozptyl a nejistotu odhadu; vysoké hodnoty znamenají nestabilní měření.
- **Ratio** je poměr vůči baseline ve stejném běhu.
- **Gen0/Gen1/Gen2** jsou počty kolekcí na 1 000 operací, **Allocated** alokované bajty na jednu operaci.

### Hardwarové čítače :id=hardware-counters

`[HardwareCounters(HardwareCounter.BranchMispredictions, HardwareCounter.CacheMisses)]` čte čítače procesoru. Na Windows vyžaduje ETW a oprávnění správce, podpora na jiných platformách je omezená. Ověřte ji v dokumentaci použité verze.

### Exportéry a CI integrace

Atributy `[MarkdownExporter]` a `[JsonExporterAttribute.Full]` uloží výsledky do souborů. Pro porovnání běhů v CI potřebujete stabilní stroj a nástroj nebo skript, který porovná exportovaná data se zvolenou tolerancí.

### Mikro- a makrobenchmarky :id=micro-vs-macro-benchmark

Mikrobenchmark měří izolovanou operaci v nanosekundách až milisekundách. Makrobenchmark měří celý scénář (HTTP požadavek, databázi, síť); proto potřebuje zátěžový nástroj, realistická data a metriky na straně serveru.

</details>
