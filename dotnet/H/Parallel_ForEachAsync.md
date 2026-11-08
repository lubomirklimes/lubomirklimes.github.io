# Parallel.ForEachAsync – asynchronní paralelní zpracování kolekcí

`Parallel.ForEachAsync` (.NET 6+) zpracuje položky kolekce asynchronní funkcí s **omezeným počtem souběžně běžících operací**. Leží mezi sekvenčním `foreach` s `await` (bez souběhu) a `Task.WhenAll` nad všemi položkami (bez limitu). Pro číselný rozsah existuje od .NET 8 obdobné `Parallel.ForAsync`.

**Prostředí:** .NET 10 / C# 14.

## 1. Princip :id=_1-koncept

- **Limit souběhu** určuje `ParallelOptions.MaxDegreeOfParallelism`. Výchozí hodnota `-1` u této metody znamená `Environment.ProcessorCount`, ne neomezený souběh. U I/O operací nastavte limit podle kapacity cíle (databáze, API), ne podle počtu jader.
- **Pořadí**: položky se odebírají postupně ze vstupu, ale dokončují se v libovolném pořadí.
- **Chyba**: první výjimka zruší interní token, nové položky se už nespouštějí, metoda počká na rozběhnuté a pak skončí chybou. `await` vyhodí jednu z výjimek, úplný seznam je v `Exception` vrácené úlohy.
- **Zrušení**: `ParallelOptions.CancellationToken` se propojí s interním tokenem, který dostává každé volání těla.

Async paralelismus není CPU paralelismus: pokud tělo hlavně počítá, použijte [Parallel.For nebo PLINQ](TPL_PLINQ.md).

## 2. Příklad

### Základní použití

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`; ukazuje limit souběhu a výsledek.

```csharp
int[] vstup = Enumerable.Range(1, 20).ToArray();
int[] vysledky = new int[vstup.Length];
int aktivni = 0, maximum = 0;

await Parallel.ForEachAsync(Enumerable.Range(0, vstup.Length),
    new ParallelOptions { MaxDegreeOfParallelism = 4 },
    async (i, ct) =>
    {
        int nyni = Interlocked.Increment(ref aktivni);
        AktualizujMaximum(ref maximum, nyni);
        try
        {
            await Task.Delay(10, ct);           // Zastupuje I/O.
            vysledky[i] = vstup[i] * vstup[i];  // Každá iterace má vlastní index: zápis bez zámku.
        }
        finally
        {
            Interlocked.Decrement(ref aktivni);
        }
    });

Console.WriteLine($"Limit dodržen: {maximum <= 4}");
Console.WriteLine($"Součet čtverců: {vysledky.Sum()}");

static void AktualizujMaximum(ref int maximum, int hodnota)
{
    int predchozi;
    do predchozi = Volatile.Read(ref maximum);
    while (hodnota > predchozi && Interlocked.CompareExchange(ref maximum, hodnota, predchozi) != predchozi);
}
```

Výstup: `Limit dodržen: True` a `Součet čtverců: 2870`. Výsledky jsou v pořadí vstupu díky indexům, ne díky pořadí dokončení.

### Zpracování souborů s omezením I/O

**Metoda služby; `IImportRepo` je vlastní rozhraní, `scopeFactory` je `IServiceScopeFactory`.**

```csharp
string[] soubory = Directory.GetFiles(adresar, "*.csv");
await Parallel.ForEachAsync(soubory,
    new ParallelOptions { MaxDegreeOfParallelism = 8, CancellationToken = ct },
    async (soubor, token) =>
    {
        // Vlastní scope = vlastní DbContext; jeden kontext nesmí sloužit souběžným operacím.
        await using var scope = scopeFactory.CreateAsyncScope();
        var repo = scope.ServiceProvider.GetRequiredService<IImportRepo>();
        await foreach (string radek in File.ReadLinesAsync(soubor, token))
            await repo.PridejAsync(radek, token);
        await repo.UlozAsync(token);
    });
```

Limit 8 je příklad; odpovídá zhruba velikosti poolu spojení a možnostem disku. Při selhání jednoho souboru se ostatní nespustí a už zpracované zůstanou uložené; rozhodněte, zda import má být po souborech idempotentní.

### Zpracování s výsledky (sběr výstupů)

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`; ukazuje zastavení po chybě.

```csharp
int zpracovano = 0;
try
{
    await Parallel.ForEachAsync(Enumerable.Range(1, 100),
        new ParallelOptions { MaxDegreeOfParallelism = 2 },
        async (n, ct) =>
        {
            await Task.Delay(10, ct);
            if (n == 5) throw new InvalidOperationException($"Položka {n} selhala.");
            Interlocked.Increment(ref zpracovano);
        });
}
catch (InvalidOperationException e)
{
    Console.WriteLine($"{e.Message} Zbytek se nespustil: {zpracovano < 99}");
}
```

Výstup: `Položka 5 selhala. Zbytek se nespustil: True`. Kolik položek proběhlo, se mezi běhy liší. Pokud chcete zpracovat vše a chyby jen sbírat, zachyťte je v těle, uložte do `ConcurrentQueue<Exception>` a vyhodnoťte po skončení. Pro výsledky bez indexu se hodí `ConcurrentBag<T>` nebo `ConcurrentQueue<T>`; pořadí pak není dané.

### Srovnání přístupů

**Tři varianty nad kolekcí `polozky` s vlastní `ZpracujAsync`.**

```csharp
// Sekvenčně: jedna operace naráz.
foreach (var p in polozky)
    await ZpracujAsync(p, ct);

// Bez limitu: všechny operace naráz; tisíce položek přetíží cíl.
await Task.WhenAll(polozky.Select(p => ZpracujAsync(p, ct)));

// S limitem: nejvýš 20 současně.
await Parallel.ForEachAsync(polozky,
    new ParallelOptions { MaxDegreeOfParallelism = 20, CancellationToken = ct },
    async (p, token) => await ZpracujAsync(p, token));
```

Celková doba závisí na latenci cíle a na tom, zda cíl při souběhu nezpomalí. Konkrétní minuty nebo sekundy lze odhadnout jen měřením.

## 3. Kdy použít

- **Dávkové I/O operace**: volání API, import souborů, zápisy do databáze s limitem.
- **Když `Task.WhenAll` přetěžuje cíl**: limit chrání pool spojení, rate limit API i vlastní paměť.
- **Migrace a přepočty dat**, kde jde o propustnost a jednotlivé položky jsou nezávislé.
- **Ne pro vícefázové zpracování**: tam se lépe hodí [Channels](Paralelni_zpracovani_Channels.md).

## 4. Časté chyby

- **Limit podle počtu jader u I/O**: výchozí hodnota je jen odhad pro CPU; I/O limit musí vycházet z kapacity cíle.
- **Polknutá výjimka v těle**: metoda skončí úspěšně a selhání zmizí; chyby buď nechte projít, nebo je sbírejte a vyhodnoťte.
- **Sdílený stav bez synchronizace**: `List<T>.Add` z více iterací současně poškodí data. Použijte indexy, souběžné kolekce nebo `Interlocked`.
- **Sdílený `DbContext` nebo jiný ne-thread-safe objekt**: každá iterace potřebuje vlastní instanci (scope nebo `IDbContextFactory`).
- **Ignorovaný token těla**: předávejte token z parametru lambdy, ne vnější; jen ten se zruší i po chybě jiné položky.

---

<details>
<summary>Volitelné podrobnosti: SemaphoreSlim, Channels a alokace</summary>

### Parallel.ForEachAsync vs SemaphoreSlim

Před .NET 6 se limit řešil semaforem:

**Fragment s kolekcí `polozky`.**

```csharp
using var limit = new SemaphoreSlim(20);
Task[] ulohy = polozky.Select(async polozka =>
{
    await limit.WaitAsync(ct);
    try { await ZpracujAsync(polozka, ct); }
    finally { limit.Release(); }
}).ToArray();
await Task.WhenAll(ulohy);
```

Rozdíl: tato varianta vytvoří úlohu pro **každou** položku hned na začátku a po chybě pokračuje se zbytkem. `Parallel.ForEachAsync` odebírá položky postupně a po chybě nové nespouští. Semafor se hodí, když limitujete jen část metody nebo sdílíte jeden limit mezi více místy kódu.

### Parallel.ForEachAsync vs System.Threading.Channels

**Schéma.**

```text
Parallel.ForEachAsync: hotová vstupní kolekce → jedna asynchronní operace na položku → konec
Channels:              producent → fronta → fáze 1 → fronta → fáze 2 …  (průběžný vstup, více fází)
```

Kanály se hodí, když položky přicházejí průběžně, fáze mají různou rychlost nebo potřebujete zpětný tlak mezi nimi.

### Výkon a alokace

`Parallel.ForEachAsync` spouští jen tolik pracovních smyček, kolik povoluje limit, a každá si odebírá další položky ze vstupu. Pro velké kolekce proto nevzniká úloha pro každou položku najednou. Interní implementace se může mezi verzemi měnit; spoléhejte jen na zdokumentované chování.

</details>
