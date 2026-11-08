# Paralelní kolekce v .NET – BlockingCollection a producent-konzument vzor

`BlockingCollection<T>` je thread-safe fronta pro vzor producent-konzument se **synchronním** čekáním: `Add` blokuje vlákno, když je fronta plná, a čtení blokuje, když je prázdná. Hodí se pro kód s dedikovanými vlákny. V asynchronním kódu (ASP.NET Core, hostované služby) použijte místo ní [Channels](Paralelni_zpracovani_Channels.md).

**Prostředí:** .NET 10 / C# 14, jmenný prostor `System.Collections.Concurrent`.

## 1. Princip :id=_1-koncept

Producent vytváří nebo přijímá data a vkládá je do fronty; konzument je odebírá a zpracovává. `BlockingCollection<T>` přidává koordinaci:

- **`boundedCapacity`** omezí velikost fronty; plná fronta zablokuje producenta (zpětný tlak).
- **`Take`** nebo **`GetConsumingEnumerable()`** zablokuje konzumenta, dokud nepřijde prvek; nečeká aktivně (busy-wait), ale vlákno je po dobu čekání obsazené.
- **`CompleteAdding()`** oznámí, že další prvky nepřijdou. Konzumenti dočtou frontu a `GetConsumingEnumerable` skončí. Další `Add` vyhodí `InvalidOperationException`.

Kolekce obaluje jinou thread-safe kolekci: výchozí je `ConcurrentQueue<T>` (FIFO), lze předat i `ConcurrentStack<T>` nebo `ConcurrentBag<T>`. Je `IDisposable`; uvolněte ji, až s ní všichni přestanou pracovat.

## 2. Příklad

### Základní producent-konzument

**Fragment; `ZiskejData` a `Zpracuj` jsou vlastní synchronní metody.**

```csharp
using var fronta = new BlockingCollection<WorkItem>(boundedCapacity: 100);

var producent = Task.Run(() =>
{
    try
    {
        foreach (var polozka in ZiskejData())
            fronta.Add(polozka); // Při plné frontě blokuje.
    }
    finally
    {
        fronta.CompleteAdding(); // I po výjimce, jinak konzument čeká navždy.
    }
});

var konzument = Task.Run(() =>
{
    foreach (var polozka in fronta.GetConsumingEnumerable())
        Zpracuj(polozka);
});

await Task.WhenAll(producent, konzument);
```

### Více producentů a konzumentů

S více producenty smí `CompleteAdding` zavolat až koordinátor po skončení **všech**.

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`.

```csharp
using System.Collections.Concurrent;

using var fronta = new BlockingCollection<int>(boundedCapacity: 50);

// Konzument blokuje vlákno po celou dobu běhu: dedikované vlákno místo vlákna ThreadPoolu.
Task<int>[] konzumenti = Enumerable.Range(0, 2).Select(_ => Task.Factory.StartNew(() =>
{
    int pocet = 0;
    foreach (int polozka in fronta.GetConsumingEnumerable())
        pocet++;
    return pocet;
}, CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default)).ToArray();

Task[] producenti = Enumerable.Range(0, 3).Select(p => Task.Run(() =>
{
    for (int i = 0; i < 100; i++)
        fronta.Add(p * 1000 + i);
})).ToArray();

try
{
    await Task.WhenAll(producenti);
}
finally
{
    fronta.CompleteAdding(); // Po všech producentech, i když některý selže.
}

int[] pocty = await Task.WhenAll(konzumenti);
Console.WriteLine($"Zpracováno: {pocty.Sum()}");
```

Výstup: `Zpracováno: 300`. Kolik prvků zpracoval který konzument a v jakém pořadí, se mezi běhy liší.

### S podporou zrušení

**Fragment s `fronta` z předchozí ukázky a vlastní `Zpracuj`.**

```csharp
using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
var konzument = Task.Factory.StartNew(() =>
{
    try
    {
        foreach (var polozka in fronta.GetConsumingEnumerable(cts.Token))
            Zpracuj(polozka);
    }
    catch (OperationCanceledException) when (cts.IsCancellationRequested)
    {
        // Zrušení ukončí čekání; prvky, které zůstaly ve frontě, se nezpracují.
    }
}, CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default);

await konzument;
```

Zrušení přeruší čekání na další prvek, ne právě probíhající `Zpracuj`. Rozhodněte, co se stane s prvky, které ve frontě zůstaly.

## 3. Kdy použít

- **Synchronní pipeline s dedikovanými vlákny**: čtení zařízení, převod dat, zápis, kde je blokování přirozené.
- **Omezení paměti mezi rychlým producentem a pomalým konzumentem** v synchronním kódu.
- **Náhrada ručního `lock` + `Monitor.Wait/Pulse`**: kolekce synchronizaci zapouzdřuje.
- **Ne pro async kód**: blokující čekání na vláknech ThreadPoolu vede k vyhladovění; použijte `Channel<T>`.

## 4. Časté chyby

- **`CompleteAdding` mimo `finally`**: po výjimce producenta konzument čeká navždy.
- **`CompleteAdding` od prvního producenta, který skončí**: ostatní pak dostanou `InvalidOperationException`. Dokončení koordinujte.
- **Neomezená kapacita**: bez `boundedCapacity` fronta roste bez limitu.
- **Blokující konzument na vlákně ThreadPoolu**: dlouho běžící smyčka trvale zabírá vlákno; použijte `TaskCreationOptions.LongRunning` nebo vlastní `Thread`.
- **Ruční smyčka `while (!IsCompleted) Take()`**: mezi kontrolou a `Take` může dojít k dokončení a `Take` vyhodí výjimku; `GetConsumingEnumerable()` nebo `TryTake` s timeoutem to ošetří.

---

<details>
<summary>Volitelné podrobnosti: jak blokuje a srovnání s Channels</summary>

### Jak BlockingCollection blokuje bez busy-wait

Uvnitř používá dva semafory: jeden pro volná místa (producent), druhý pro dostupné prvky (konzument). `Add` a `Take` na nich čekají **synchronně** (`Wait`), takže vlákno spí v jádře a nespotřebovává CPU, ale je po celou dobu obsazené a nemůže dělat jinou práci. Asynchronní čekání `BlockingCollection` nenabízí.

### Srovnání BlockingCollection vs System.Threading.Channels

| Vlastnost | `BlockingCollection<T>` | `Channel<T>` |
|---|---|---|
| Čekání | Synchronní (blokuje vlákno), volitelně se zrušením | Asynchronní (`await`) |
| Zpětný tlak | `boundedCapacity` | `BoundedChannelOptions`, režimy `FullMode` |
| Dokončení s chybou | Ne | `TryComplete(exception)` |
| Více čtenářů a zapisovatelů | Ano | Ano, s volitelnou optimalizací `SingleReader`/`SingleWriter` |
| Dostupnost | .NET Framework 4.0+ | .NET Core 3.0+ (balíček i pro starší) |

**Ekvivalent s kanálem v asynchronním kódu; `item` a `ct` dodá volající.**

```csharp
var kanal = Channel.CreateBounded<WorkItem>(100); // FullMode.Wait = zpětný tlak
try { await kanal.Writer.WriteAsync(item, ct); }
finally { kanal.Writer.Complete(); }

await foreach (var polozka in kanal.Reader.ReadAllAsync(ct))
    Zpracuj(polozka);
```

</details>
