# `IAsyncEnumerable<T>` a asynchronní streamování dat

`IAsyncEnumerable<T>` je **asynchronní proud** prvků: získání každého dalšího prvku může čekat na I/O. Prochází se přes `await foreach`; samotný proud **nelze awaitovat** jako úlohu. Spotřebitel tak může zpracovat první prvky dřív, než producent připraví poslední.

**Prostředí:** .NET 10 / C# 14 (asynchronní proudy existují od C# 8). LINQ operátory nad `IAsyncEnumerable<T>` jsou od .NET 10 součástí knihovny tříd (`System.Linq.AsyncEnumerable`); dříve je dodával balíček System.Linq.Async.

## 1. Princip :id=_1-koncept

`await foreach` si od proudu vyžádá enumerátor (`GetAsyncEnumerator`), opakovaně volá `MoveNextAsync()` a na konci, i při `break` nebo výjimce, zavolá `DisposeAsync()`. Metoda s `async` a `yield return` se přeloží na proud, jehož tělo běží **až při procházení** a jen tak daleko, jak spotřebitel čte.

Zrušení: token předaný přes `WithCancellation(ct)` doputuje do parametru iterátoru označeného `[EnumeratorCancellation]`. Bez atributu jej iterátor nedostane (překladač na to upozorní varováním CS8425).

### IAsyncEnumerable\<T\> vs Task\<IEnumerable\<T\>\>

| | `Task<IEnumerable<T>>` | `IAsyncEnumerable<T>` |
|---|---|---|
| Kdy je k dispozici první prvek | Po dokončení celé úlohy | Jakmile jej producent vydá |
| Paměť | Typicky celá kolekce najednou | Podle implementace, často po prvcích nebo dávkách |
| Asynchronní čekání | Jednou, na celý výsledek | Před každým prvkem (`MoveNextAsync`) |
| Zrušení | Během úlohy | Během úlohy i mezi prvky |
| Opakované procházení | Výsledek lze projít znovu | Každý průchod obvykle znovu spustí producenta |

## 2. Příklad

### Základní asynchronní iterátor

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`; ukazuje i úklid při `break` a zrušení.

```csharp
using System.Runtime.CompilerServices;

using var cts = new CancellationTokenSource();
await foreach (int cislo in GenerujAsync(10).WithCancellation(cts.Token))
{
    Console.WriteLine(cislo);
    if (cislo == 2) break; // Předčasný konec zavolá DisposeAsync a spustí finally iterátoru.
}

cts.Cancel();
try
{
    await foreach (int cislo in GenerujAsync(10).WithCancellation(cts.Token))
        Console.WriteLine(cislo);
}
catch (OperationCanceledException)
{
    Console.WriteLine("Iterace zrušena.");
}

static async IAsyncEnumerable<int> GenerujAsync(int pocet, [EnumeratorCancellation] CancellationToken ct = default)
{
    try
    {
        for (int i = 0; i < pocet; i++)
        {
            await Task.Delay(10, ct); // Zastupuje I/O; token zruší i probíhající čekání.
            yield return i;
        }
    }
    finally
    {
        Console.WriteLine("Úklid iterátoru.");
    }
}
```

Výstup: `0`, `1`, `2`, `Úklid iterátoru.`, poté `Úklid iterátoru.` a `Iterace zrušena.` U druhého průchodu se nevypíše žádné číslo, protože token je zrušený už před prvním čekáním.

### Čtení řádků ze souboru

**Fragment asynchronní metody s tokenem `ct` a vlastní `ZpracujRadekAsync`.**

```csharp
await foreach (string radek in File.ReadLinesAsync("data.txt", ct))
    await ZpracujRadekAsync(radek, ct);
```

`File.ReadLinesAsync` (.NET 7+) otevře soubor až při procházení a zavře jej po dokončení, `break` i výjimce. Celý soubor se do paměti nenačte, jen buffer čtečky.

### Čtení z databáze (EF Core)

**Fragment s `DbContext db` a balíčkem Microsoft.EntityFrameworkCore.**

```csharp
await foreach (Produkt produkt in db.Produkty
    .Where(p => p.Aktivni)
    .AsAsyncEnumerable()
    .WithCancellation(ct))
{
    await ZpracujProduktAsync(produkt, ct);
}
```

Řádky se čtou postupně z otevřeného výsledku dotazu. Spojení a `DbContext` jsou po celou dobu iterace obsazené; během ní nespouštějte nad stejným kontextem další dotaz. U dlouhého zpracování zvažte čtení po stránkách. Sledování změn (change tracking) by drželo načtené entity v paměti; pro čtení použijte `AsNoTracking()`.

### Streamování přes Minimal API / ASP.NET Core

**Endpoint a klient; `IProduktRepository.CtiVsechnyAsync` vrací `IAsyncEnumerable<Produkt>`.**

```csharp
// Server: System.Text.Json zapisuje pole JSON postupně, jak prvky přicházejí.
app.MapGet("/produkty/stream", (IProduktRepository repo, CancellationToken ct) => repo.CtiVsechnyAsync(ct));

// Klient (.NET 8+): prvky se deserializují průběžně.
await foreach (Produkt? produkt in http.GetFromJsonAsAsyncEnumerable<Produkt>("produkty/stream", ct))
    Zobraz(produkt!);
```

Zda klient vidí první prvky dřív, závisí i na proxy a bufferování odpovědi po cestě.

### ConfigureAwait v await foreach

**Fragment knihovního kódu.**

```csharp
await foreach (var polozka in zdroj.WithCancellation(ct).ConfigureAwait(false))
    Zpracuj(polozka);
```

`ConfigureAwait(false)` platí pro všechna čekání smyčky (`MoveNextAsync` i `DisposeAsync`). Pravidla, kdy jej použít, jsou stejná jako u běžného `await`: [ConfigureAwait](ConfigureAwait.md).

## 3. Kdy použít

- **Velké nebo nekonečné sady dat** z databáze, souboru nebo stránkovaného API, které chcete zpracovávat průběžně.
- **Streamované odpovědi** HTTP nebo gRPC server streaming.
- **Proudy událostí**: čtení z fronty, `ChannelReader<T>.ReadAllAsync()`.
- **Generátory s I/O**: každá další stránka vyžaduje asynchronní volání.

Pro malé kolekce, které stejně potřebujete celé (řazení, náhodný přístup), je `Task<List<T>>` jednodušší.

## 4. Časté chyby

- **`await zdroj` místo `await foreach`**: `IAsyncEnumerable<T>` není awaitovatelný; výsledek zpracujete smyčkou nebo operátorem jako `ToListAsync`.
- **Chybějící `[EnumeratorCancellation]`**: token z `WithCancellation` se k iterátoru nedostane.
- **Předpoklad, že proud lze projít dvakrát levně**: druhý průchod obvykle znovu spustí dotaz nebo čtení.
- **Uložení `IAsyncEnumerable` z EF Core a iterace po skončení požadavku**: `DbContext` už je uvolněný.
- **Úklid mimo `finally`**: po `break` nebo zrušení se kód za smyčkou v iterátoru nespustí; uvolnění patří do `finally` nebo `await using`.

---

<details>
<summary>Volitelné podrobnosti: IAsyncEnumerator, zpětný tlak a LINQ</summary>

### Jak funguje IAsyncEnumerator interně

`await foreach` se přeloží přibližně na:

**Ekvivalent smyčky.**

```csharp
await using IAsyncEnumerator<T> e = zdroj.GetAsyncEnumerator(ct);
while (await e.MoveNextAsync())
    Zpracuj(e.Current);
```

`MoveNextAsync()` vrací `ValueTask<bool>`. Je-li další prvek k dispozici hned, dokončí se synchronně bez alokace; enumerátor generovaný překladačem navíc recykluje sám sebe jako zdroj čekání. Pravidla `ValueTask` (jedno spotřebování) proto platí i zde.

### Zpětný tlak a Channel :id=backpressure-s-channel

Async iterátor je řízen spotřebitelem (pull): producent pokračuje, až když spotřebitel zavolá `MoveNextAsync`. Pomalý spotřebitel tak producenta přirozeně brzdí, ale producent mezitím nepracuje dopředu. Chcete-li, aby producent předbíhal o omezený počet prvků, vložte mezi ně ohraničený kanál:

**Fragment; producent zapisuje do `kanal.Writer` a po dokončení volá `Complete`.**

```csharp
var kanal = Channel.CreateBounded<Polozka>(capacity: 100); // Producent čeká, je-li ve frontě 100 prvků.
await foreach (Polozka polozka in kanal.Reader.ReadAllAsync(ct))
    await ZpracujAsync(polozka, ct);
```

Úplný vzor s dokončením a chybami: [Channels](Paralelni_zpracovani_Channels.md).

### LINQ nad IAsyncEnumerable

**Samostatný `Program.cs`** v konzolovém projektu `net10.0` s vestavěným `System.Linq.AsyncEnumerable`.

```csharp
List<int> vysledek = await CislaAsync()
    .Where(x => x % 2 == 0)
    .Select(x => x * 10)
    .Take(3)
    .ToListAsync(); // Take ukončí odběr, zbytek proudu se nevyžádá.
Console.WriteLine(string.Join(", ", vysledek));

static async IAsyncEnumerable<int> CislaAsync()
{
    for (int i = 0; ; i++)
    {
        await Task.Yield();
        yield return i;
    }
}
```

Výstup: `0, 20, 40`. Nekonečný proud skončí díky `Take`. Asynchronní predikát se v .NET 10 předává přetížením s `CancellationToken` a `ValueTask` (například `Where(async (x, ct) => await JePlatneAsync(x, ct))`); starší balíček používal názvy jako `WhereAwait`.

</details>
