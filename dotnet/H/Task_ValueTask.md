# Správné použití `Task` a `ValueTask`

`Task<T>` je výchozí návratový typ asynchronní metody. `ValueTask<T>` je optimalizace pro metody, které se **většinou dokončí synchronně** (například zásah do cache), nebo pro API, které recykluje objekty čekání. Výměnou za ušetřenou alokaci má přísnější pravidla použití.

**Prostředí:** .NET 10 / C# 14.

## 1. Princip :id=_1-koncept

### Task\<T\>

`Task<T>` je třída. Úlohu lze awaitovat opakovaně, z více míst i souběžně a výsledek zůstane dostupný. Ne každé vrácení úlohy alokuje: `Task.CompletedTask` je sdílený a runtime u synchronně dokončených `async` metod vrací z cache úlohy pro některé hodnoty (například `bool` nebo malá celá čísla). Obecně ale hotová `Task<T>` s novým výsledkem znamená alokaci.

### ValueTask\<T\>

`ValueTask<T>` je struktura, která obsahuje buď přímo výsledek, nebo `Task<T>`, nebo `IValueTaskSource<T>` (objekt, který lze po dokončení znovu použít). Pravidla pro konzumenta:

- awaitujte jej **nejvýš jednou** a ne souběžně z více míst,
- nečtěte `.Result` ani `GetAwaiter().GetResult()`, dokud není dokončen,
- pro opakované nebo sdílené použití zavolejte jednou `.AsTask()` (nebo `.Preserve()`) a dál pracujte s výsledkem.

Porušení pravidel u varianty s `IValueTaskSource` znamená nedefinované chování: zdroj mezitím mohl obsloužit jinou operaci.

### Kdy co použít

| Situace | Typ |
|---|---|
| Běžné asynchronní metody, veřejná API aplikace | `Task` / `Task<T>` |
| Horká cesta, která měřitelně často končí synchronně | `ValueTask<T>` |
| Infrastruktura recyklující čekání (`Channel`, `PipeReader`, sokety) | `ValueTask<T>` s `IValueTaskSource<T>` |
| Výsledek se ukládá, sdílí nebo awaituje víckrát | `Task<T>` |

## 2. Příklad

<span id="taskfromresult-cachovaný-výsledek-bez-alokace"></span>

### Task.FromResult a hotové úlohy

**Metoda služby s vlastním slovníkem `_aktivni` a metodou `NactiZDatabazeAsync`.**

```csharp
public Task<bool> JeAktivniAsync(int id, CancellationToken ct)
{
    if (_aktivni.TryGetValue(id, out bool aktivni))
        return Task.FromResult(aktivni); // Hotová úloha bez stavového automatu.
    return NactiZDatabazeAsync(id, ct);
}
```

Metoda bez `async` vrací úlohu přímo a nevytváří stavový automat. Výjimka z části před `return` se ale vyhodí synchronně, ne uložená v úloze; validaci argumentů to obvykle nevadí.

<span id="valuetask-synchronní-hot-path"></span>

### ValueTask – častá synchronní cesta

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`.

```csharp
using System.Collections.Concurrent;

var cache = new CenovaCache();
ValueTask<decimal> prvni = cache.ZiskejCenuAsync("A", CancellationToken.None);
Console.WriteLine($"První volání hotové synchronně: {prvni.IsCompletedSuccessfully}");
Console.WriteLine($"Cena: {await prvni}");

ValueTask<decimal> druhe = cache.ZiskejCenuAsync("A", CancellationToken.None);
Console.WriteLine($"Druhé volání hotové synchronně: {druhe.IsCompletedSuccessfully}");
Console.WriteLine($"Cena: {await druhe}");

public sealed class CenovaCache
{
    private readonly ConcurrentDictionary<string, decimal> _ceny = new();

    public ValueTask<decimal> ZiskejCenuAsync(string kod, CancellationToken ct)
        => _ceny.TryGetValue(kod, out decimal cena)
            ? ValueTask.FromResult(cena)                   // Zásah: výsledek uvnitř struktury.
            : new ValueTask<decimal>(NactiAsync(kod, ct)); // Výpadek: skutečné čekání přes Task.

    private async Task<decimal> NactiAsync(string kod, CancellationToken ct)
    {
        await Task.Delay(10, ct); // Simulace zdroje.
        return _ceny[kod] = 199m;
    }
}
```

Výstup: první volání hotové synchronně `False`, druhé `True`, cena v obou případech `199`. Přínos se projeví jen tehdy, když zásahy převažují a metoda je volána velmi často; jinak je `Task<T>` jednodušší.

<span id="❌-chybné-použití-valuetask"></span>

### Chybné použití ValueTask

**Fragment; `ZiskejAsync` vrací `ValueTask<int>`.**

```csharp
ValueTask<int> vt = ZiskejAsync(ct);
int a = await vt;
int b = await vt;          // Chyba: druhé await.
Task<int> t = vt.AsTask(); // Chyba: AsTask až po spotřebování.

// Správně, pokud výsledek potřebujete víckrát nebo na více místech:
Task<int> sdilena = ZiskejAsync(ct).AsTask();
int c = await sdilena, d = await sdilena;
```

Pravidla se týkají jedné instance `ValueTask`; další `await` jiných operací v téže metodě je v pořádku.

### IValueTaskSource – pokročilá optimalizace

`IValueTaskSource<T>` umožní, aby jeden objekt opakovaně představoval různé operace: po dokončení a spotřebování se vrátí do zásoby. Tak fungují například `ChannelReader<T>.ReadAsync` a `PipeReader.ReadAsync`:

**Fragment s `PipeReader reader` a tokenem `ct`.**

```csharp
ReadResult vysledek = await reader.ReadAsync(ct); // ValueTask<ReadResult>, ne počet bajtů.
ReadOnlySequence<byte> data = vysledek.Buffer;
reader.AdvanceTo(data.End);
```

Vlastní implementace je složitá (verze tokenů, souběh, zrušení); obvykle stačí `ManualResetValueTaskSourceCore<T>` uvnitř infrastrukturního typu.

## 3. Kdy použít

- **`Task<T>`**: výchozí volba pro controllery, služby, rozhraní aplikace a vše, co se může ukládat nebo awaitovat víckrát.
- **`ValueTask<T>`**: cíleně, když měření ukáže alokace úloh na horké cestě s převahou synchronního dokončení, nebo při implementaci rozhraní, které jej předepisuje (`IAsyncEnumerator<T>.MoveNextAsync`, `IAsyncDisposable.DisposeAsync`).
- **Negenerický `ValueTask`**: stejné případy pro metody bez výsledku; úspora je menší, protože `Task.CompletedTask` je sdílený.

## 4. Časté chyby

- **Opakované nebo souběžné awaitování `ValueTask`**: použijte `AsTask()` před prvním použitím.
- **Uložení `ValueTask` do pole nebo kolekce**: zvyšuje riziko vícenásobného použití; ukládejte `Task`.
- **`ValueTask` u metody, která skoro vždy čeká**: nic neušetří a zkomplikuje API.
- **`.Result` u nedokončeného `ValueTask`**: u varianty se zdrojem je chování nedefinované; čekejte přes `await`.

---

<details>
<summary>Volitelné podrobnosti: recyklace, měření a rozhraní knihoven</summary>

### Proč ValueTask nestačí pro recyklaci

`ValueTask<T>` sám ušetří alokaci jen při synchronním dokončení. `async ValueTask<T>` metoda, která skutečně čeká, stále vytvoří objekt na haldě pro stavový automat. Recyklaci i v asynchronní cestě zajistí až `IValueTaskSource<T>`; na tom staví `Channel<T>`:

**Fragment s tokenem `ct`.**

```csharp
var kanal = Channel.CreateUnbounded<int>();
await kanal.Writer.WriteAsync(42, ct);
int polozka = await kanal.Reader.ReadAsync(ct); // ValueTask<int>, při čekání ze sdíleného zdroje.
```

### Měření :id=benchmarky-benchmarkdotnet

Rozdíl mezi `Task` a `ValueTask` je obvykle desítky bajtů na volání a projeví se až při velmi vysoké frekvenci; konkrétní časy změřte ve svém prostředí. Porovnejte obě varianty přes [BenchmarkDotNet](Benchmarking.md) s `[MemoryDiagnoser]` a se skutečným poměrem zásahů a výpadků.

### Doporučení pro rozhraní knihoven

Pro běžná rozhraní (repozitáře, služby) volte `Task<T>`: je jednodušší pro implementace i pro volající, kteří mohou výsledek bezpečně ukládat a kombinovat přes `WhenAll`. `ValueTask<T>` v rozhraní zvolte jen tehdy, když očekáváte implementace s převážně synchronním dokončením a volající na horké cestě. Rozhodnutí je součástí veřejného kontraktu a později se mění obtížně.

</details>
