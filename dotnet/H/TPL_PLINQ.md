# Praktické příklady s .NET Parallel Library a PLINQ

Task Parallel Library (TPL) nabízí `Parallel.For`, `Parallel.ForEach` a `Parallel.Invoke`; PLINQ (paralelní LINQ) přidává `AsParallel()`. Obojí slouží k **CPU paralelismu**: rozdělení výpočtu mezi jádra. Na čekání na I/O jsou určené `async`/`await` a [Parallel.ForEachAsync](Parallel_ForEachAsync.md).

**Prostředí:** .NET 10 / C# 14. Kolik vláken se skutečně použije, rozhoduje ThreadPool podle počtu jader a zátěže.

## 1. Princip :id=_1-koncept

### Kdy použít TPL vs async/await

| Typ práce | Nástroj |
|---|---|
| Čekání na I/O (síť, disk, DB) | `async`/`await`, `Task.WhenAll`, `Parallel.ForEachAsync` |
| CPU výpočet nad kolekcí (komprese, hashování, obraz, matematika) | `Parallel.For`/`ForEach`, PLINQ |
| Smíšené: načíst, pak spočítat | Oddělené kroky, případně pipeline přes `Channel` |

### Parallel.For a Parallel.ForEach

Rozdělí iterace mezi vlákna ThreadPoolu a **synchronně čekají**, až skončí všechny; volající vlákno se zapojí do práce. Počet souběžných vláken určuje plánovač, nikoli počet iterací. Výjimky z iterací se sesbírají do `AggregateException`.

### PLINQ

`AsParallel()` rozdělí zdroj na části a operátory dotazu provádí souběžně. Výsledek je ve výchozím stavu **neuspořádaný**; `AsOrdered()` zachová pořadí zdroje za cenu synchronizace. Dotaz se spustí až materializací (`ToList`, `ToArray`, `foreach`).

Paralelizace se vyplatí, jen když práce na prvek převýší režii rozdělení a sloučení. Kde je tato hranice, závisí na výpočtu i stroji; ověřte ji měřením.

## 2. Příklad

### Parallel.For – CPU-bound výpočet

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`; výsledek se porovná se sekvenčním výpočtem.

```csharp
long[] data = Enumerable.Range(1, 1_000_000).Select(i => (long)i).ToArray();
long celkem = 0;

Parallel.For(0, data.Length,
    () => 0L,                                                  // Lokální mezisoučet pro každé vlákno.
    (i, _, mezisoucet) => mezisoucet + data[i] * data[i] % 7,
    mezisoucet => Interlocked.Add(ref celkem, mezisoucet));    // Sloučení jednou za vlákno, ne za prvek.

long sekvencne = data.Sum(x => x * x % 7);
Console.WriteLine($"Shoda se sekvenčním výpočtem: {celkem == sekvencne}");
```

Výstup: `Shoda se sekvenčním výpočtem: True`. Sdílenou proměnnou nezvyšujte v každé iteraci: `Interlocked` nebo zámek u milionu prvků by souběh zničil. U tak levné operace na prvek je navíc výhodnější zpracovávat rozsahy (viz Partitioner níže); zda je paralelní verze vůbec rychlejší, ukáže až měření.

### Parallel.ForEach s omezením paralelismu

**Fragment s kolekcí `obrazky` a vlastní čistě výpočetní funkcí `Zmensi`.**

```csharp
var moznosti = new ParallelOptions
{
    MaxDegreeOfParallelism = Math.Max(1, Environment.ProcessorCount / 2), // Ponechat jádra jiné práci.
    CancellationToken = ct
};
var vysledky = new ConcurrentBag<Nahled>();

Parallel.ForEach(obrazky, moznosti, obrazek =>
{
    vysledky.Add(Zmensi(obrazek)); // Žádné I/O ani await uvnitř.
});
```

Bez `MaxDegreeOfParallelism` může výpočet obsadit všechna jádra. Ve webové aplikaci tak konkuruje obsluze požadavků; tam limit nastavte vždy, nebo výpočet přesuňte do samostatné služby či fronty. Zrušení se kontroluje mezi iteracemi a vyhodí `OperationCanceledException`.

### Parallel.Invoke – souběžné nezávislé akce

**Tři nezávislé výpočetní metody nad neměnným vstupem.**

```csharp
Parallel.Invoke(
    () => statistika = SpoctiStatistiku(vstup),
    () => histogram = SpoctiHistogram(vstup),
    () => kontrolniSoucet = SpoctiHash(vstup));
```

Akce smí sdílet jen data, která nikdo nemění. Každá zapisuje do vlastní proměnné; výsledky jsou dostupné po návratu `Invoke`.

### PLINQ – paralelní LINQ dotaz

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`; ukazuje pořadí s `AsOrdered` i sběr výjimky.

```csharp
int[] cisla = Enumerable.Range(1, 1000).ToArray();

List<int> prvni = cisla.AsParallel()
    .AsOrdered()          // Bez AsOrdered by Take vrátil libovolných pět prvočísel.
    .Where(JePrvocislo)
    .Take(5)
    .ToList();
Console.WriteLine(string.Join(", ", prvni));

try
{
    _ = cisla.AsParallel().Select(x => x == 500 ? throw new InvalidOperationException("Chyba u 500.") : x).ToArray();
}
catch (AggregateException e)
{
    Console.WriteLine(e.InnerExceptions[0].Message);
}

static bool JePrvocislo(int n)
{
    if (n < 2) return false;
    for (int d = 2; d * d <= n; d++)
        if (n % d == 0) return false;
    return true;
}
```

Výstup: `2, 3, 5, 7, 11` a `Chyba u 500.` Vedlejší efekty (zápis do sdílené kolekce, výpis) uvnitř `Select` nebo `Where` poběží v nepředvídatelném pořadí; dotaz má být čistá transformace.

<span id="❌-anti-vzory-blokování-ve-smyčce"></span>

### Anti-vzory – blokování ve smyčce

**Srovnání; `ZpracujAsync` je vlastní asynchronní metoda.**

```csharp
// Blokuje vlákno ThreadPoolu v každé iteraci; při mnoha iteracích vyčerpá ThreadPool.
Parallel.For(0, 10, i => ZpracujAsync(i, ct).Wait());

// Async lambda v Parallel.ForEach je async void: smyčka nečeká a výjimky shodí proces.
Parallel.ForEach(polozky, async p => await ZpracujAsync(p, ct));

// Správně pro I/O: asynchronní čekání s limitem.
await Parallel.ForEachAsync(polozky, ct, async (p, token) => await ZpracujAsync(p, token));
```

## 3. Kdy použít

- **`Parallel.For`/`ForEach`**: výpočet nad mnoha nezávislými prvky, každý s nezanedbatelnou prací.
- **PLINQ**: výpočetně náročný LINQ dotaz nad kolekcí v paměti.
- **`Parallel.Invoke`**: několik nezávislých výpočtů nad stejnými neměnnými daty.
- **Ne pro I/O**: síť, soubory a databáze řešte asynchronně; paralelní smyčka by jen blokovala vlákna.

## 4. Časté chyby

- **Blokující čekání uvnitř paralelní smyčky**: vede k vyhladovění ThreadPoolu.
- **Sdílený proměnlivý stav**: `List<T>` nebo `Dictionary` z více vláken poškodí data; použijte lokální mezivýsledky a sloučení, souběžné kolekce nebo indexy.
- **Paralelizace levné operace**: režie rozdělení může být vyšší než zisk. Měřte.
- **Async lambda v `Parallel.ForEach`**: přeloží se jako `async void`.
- **Neomezený paralelismus na serveru**: výpočet konkuruje obsluze požadavků; nastavte limit.

---

<details>
<summary>Volitelné podrobnosti: Partitioner, výjimky PLINQ a vyčerpání ThreadPoolu</summary>

### Vlastní Partitioner pro nerovnoměrná data

**Fragmenty s polem `data` a seznamem `ulohy` různě náročných položek.**

```csharp
// Levná práce na prvek: zpracovat rozsahy, ne jednotlivé indexy.
Parallel.ForEach(Partitioner.Create(0, data.Length), rozsah =>
{
    for (int i = rozsah.Item1; i < rozsah.Item2; i++)
        data[i] = Spocti(data[i]);
});

// Nerovnoměrná práce: menší části rozdělované průběžně vyrovnají zátěž vláken.
Parallel.ForEach(Partitioner.Create(ulohy, loadBalance: true), uloha => Zpracuj(uloha));
```

### PLINQ a výjimky

Výjimky z paralelních operátorů PLINQ vyhodí materializace jako `AggregateException`. Po první výjimce se zbylá práce co nejdříve zastaví, ale některé prvky už mohly proběhnout. Zrušení přes `WithCancellation(ct)` vyhodí `OperationCanceledException`.

### Vyčerpání ThreadPoolu :id=threadpool-saturation

`Parallel.For` i PLINQ používají ThreadPool. Pokud iterace blokují (I/O, `.Wait()`), vlákna stojí, fronta roste a ThreadPool přidává vlákna jen postupně. Příznak: nízké CPU a vysoká latence. Ověřte to metrikami:

**Příkaz pro běžící proces.**

```bash
dotnet-counters monitor --process-id <pid> --counters System.Runtime
```

Sledujte délku fronty a počet vláken ThreadPoolu (`dotnet.thread_pool.queue.length`, `dotnet.thread_pool.thread.count`). Podrobnosti: [ThreadPool](Prepinani_vlaken.md).

</details>
