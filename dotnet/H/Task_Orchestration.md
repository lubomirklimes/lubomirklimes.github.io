# Orchestrace úloh: Task.WhenAll, Task.WhenAny a timeouty

Orchestrace znamená spustit více asynchronních operací souběžně a rozhodnout, kdy a s jakým výsledkem se na ně čeká. Kromě samotného čekání jde o **vlastnictví**: kdo zruší operace, které už nejsou potřeba, kdo pozoruje jejich výjimky a jak dlouho musí žít sdílené prostředky.

**Prostředí:** .NET 10 / C# 14. `Task.WhenEach` je dostupný od .NET 9.

## 1. Princip :id=_1-koncept

### Task.WhenAll – všechny musí dokončit

`Task.WhenAll` nic nespouští; čeká na úlohy, které už běží. Vrácená úloha skončí, až skončí všechny vstupní. Pokud některá selže, výsledná úloha je ve stavu Faulted a obsahuje všechny výjimky; `await` vyhodí první z nich. Výsledky `WhenAll<T>` jsou v **pořadí vstupu**, ne dokončení.

### Task.WhenAny – stačí jeden

`Task.WhenAny` vrátí první **dokončenou** úlohu, ať skončila úspěchem, chybou, nebo zrušením. Ostatní úlohy běží dál; `WhenAny` je nezruší ani nepozoruje jejich výjimky. Proto výsledek vždy zkontrolujte (`IsCompletedSuccessfully`) a zbytek vědomě zrušte a dočkejte.

### Proč ne sekvenční await

**Fragment s vlastní metodou `ZiskejAsync`.**

```csharp
// Sekvenčně: B začne až po A, celková doba je součet.
var a = await ZiskejAsync("A", ct);
var b = await ZiskejAsync("B", ct);

// Souběžně: obě operace běží zároveň, doba odpovídá nejpomalejší.
Task<string> ulohaA = ZiskejAsync("A", ct);
Task<string> ulohaB = ZiskejAsync("B", ct);
string[] obe = await Task.WhenAll(ulohaA, ulohaB);
```

Souběh je správný jen u nezávislých operací, které jsou pro souběh bezpečné, a jen pokud cíl unese zátěž.

## 2. Příklad

<span id="whenall-paralelní-načítání-dat"></span>

### WhenAll – souběžné načítání dat

**Metoda služby; tři repozitáře jsou vlastní typy, každý s vlastním připojením nebo vlastním `DbContext`.**

```csharp
public async Task<Dashboard> NactiDashboardAsync(int uzivatelId, CancellationToken ct)
{
    Task<Profil> profil = _profily.NactiAsync(uzivatelId, ct);
    Task<IReadOnlyList<Objednavka>> objednavky = _objednavky.NactiAsync(uzivatelId, ct);
    Task<int> neprectene = _notifikace.PocetNeprectenychAsync(uzivatelId, ct);

    await Task.WhenAll(profil, objednavky, neprectene);
    // Po úspěšném WhenAll jsou všechny hotové; await vrátí výsledek bez čekání.
    return new Dashboard(await profil, await objednavky, await neprectene);
}
```

Jeden `DbContext` nepodporuje souběžné operace; tři dotazy přes stejný kontext skončí výjimkou. Použijte samostatné kontexty (`IDbContextFactory`) nebo dotazy spusťte sekvenčně.

### WhenAll se zpracováním výsledků

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`.

```csharp
int[] zpozdeni = [300, 100, 200];
Task<int>[] ulohy = zpozdeni.Select(async ms =>
{
    await Task.Delay(ms);
    return ms;
}).ToArray(); // ToArray spustí každou operaci právě jednou.

int[] vysledky = await Task.WhenAll(ulohy);
Console.WriteLine(string.Join(", ", vysledky));
```

Výstup: `300, 100, 200`, tedy pořadí vstupu, přestože úlohy skončily v jiném pořadí. Bez `ToArray()` je výsledek `Select` líný a každý další výčet by operace spustil znovu. Výsledky v pořadí dokončení vrací `Task.WhenEach(ulohy)` (.NET 9+) přes `await foreach`; to pořadí ale není stabilní a nelze na ně spoléhat v testech.

### Ošetření chyb při WhenAll

**Fragment s úlohami `ulohy` a `ILogger log`.**

```csharp
Task vse = Task.WhenAll(ulohy);
try
{
    await vse;
}
catch
{
    // await vyhodil jen první výjimku; úplný seznam je na vrácené úloze.
    if (vse.Exception is { } souhrn)
        foreach (Exception chyba in souhrn.InnerExceptions)
            log.LogError(chyba, "Dílčí operace selhala.");
    throw;
}
```

Zrušené úlohy nejsou v `InnerExceptions`; pokud selhání ani jedna nemá, ale některá byla zrušena, `await` vyhodí `TaskCanceledException` a `vse.Exception` je `null`. Ověřené chování výjimek ukazuje [Pokročilé async/await](Async_await_pokrocile.md).

### Časový limit bez WhenAny :id=whenany-timeout-pattern

**Metoda se sdíleným `HttpClient http`.**

```csharp
public async Task<string> StahniSLimitemAsync(Uri adresa, TimeSpan limit, CancellationToken ct)
{
    using var casovac = CancellationTokenSource.CreateLinkedTokenSource(ct);
    casovac.CancelAfter(limit);
    try
    {
        return await http.GetStringAsync(adresa, casovac.Token); // Limit operaci skutečně zruší.
    }
    catch (OperationCanceledException) when (!ct.IsCancellationRequested)
    {
        throw new TimeoutException($"Odpověď nepřišla do {limit.TotalSeconds} s.");
    }
}
```

Vzor `WhenAny(operace, Task.Delay(limit))` jen přestane čekat a operaci nechá běžet bez pozorování. Totéž platí pro `operace.WaitAsync(limit)`: hodí se, když operaci zrušit nelze, ale zdroje dál spotřebovává.

<span id="whenany-první-dostupný-výsledek-hedging"></span>

### WhenAny – první úspěšný výsledek (hedging)

Hedging pošle stejný dotaz na více replik a použije první úspěšnou odpověď. Zbytek je nutné zrušit a dočkat, jinak běží na pozadí a jejich chyby nikdo nepozoruje.

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`. Pomalá úloha se zruší a doběhne ještě před návratem; při selhání všech zdrojů vznikne `AggregateException` se dvěma chybami.

```csharp
string vysledek = await PrvniUspesnyAsync<string>(
[
    ct => OdpovedAsync("pomalá", 300, ct),
    ct => SelzeAsync(20, ct),
    ct => OdpovedAsync("rychlá", 50, ct)
], CancellationToken.None);
Console.WriteLine(vysledek);

static async Task<T> PrvniUspesnyAsync<T>(IReadOnlyList<Func<CancellationToken, Task<T>>> zdroje, CancellationToken ct)
{
    using var zbytek = CancellationTokenSource.CreateLinkedTokenSource(ct);
    List<Task<T>> bezici = zdroje.Select(zdroj => zdroj(zbytek.Token)).ToList();
    var chyby = new List<Exception>();
    try
    {
        while (bezici.Count > 0)
        {
            Task<T> hotova = await Task.WhenAny(bezici);
            bezici.Remove(hotova);
            if (hotova.IsCompletedSuccessfully) return hotova.Result;
            if (hotova.IsFaulted) chyby.Add(hotova.Exception!.InnerException!);
            // Zrušená úloha není úspěch; pokračujeme dalšími.
        }
        ct.ThrowIfCancellationRequested();
        throw new AggregateException("Všechny zdroje selhaly.", chyby);
    }
    finally
    {
        zbytek.Cancel(); // Zbylé dotazy už nepotřebujeme.
        // Počkat na jejich ukončení; jejich zrušení a chyby jsou zde očekávané.
        // SuppressThrowing funguje jen s negenerickým Task, proto přetížení pro IEnumerable<Task>.
        await Task.WhenAll((IEnumerable<Task>)bezici).ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
    }
}

static async Task<string> OdpovedAsync(string text, int ms, CancellationToken ct)
{
    await Task.Delay(ms, ct);
    return text;
}

static async Task<string> SelzeAsync(int ms, CancellationToken ct)
{
    await Task.Delay(ms, ct);
    throw new InvalidOperationException("Replika nedostupná.");
}
```

Výstup: `rychlá`. Hedging násobí zátěž cílových systémů; v praxi se druhý dotaz posílá až po zpoždění (například po typické době odpovědi) a jen u idempotentních čtení.

## 3. Kdy použít

- **`Task.WhenAll`**: sestavení odpovědi z nezávislých zdrojů, dávka s omezeným počtem operací.
- **`Task.WhenEach`** (.NET 9+): zpracování výsledků hned, jak přicházejí.
- **Propojený CTS s `CancelAfter`**: časový limit, který operaci skutečně zruší.
- **`Task.WhenAny`**: první úspěšný výsledek nebo reakce na první událost, vždy se zrušením a dočkáním zbytku.
- **Velké kolekce**: místo `WhenAll` nad tisíci úloh použijte [Parallel.ForEachAsync](Parallel_ForEachAsync.md) s limitem.

## 4. Časté chyby

- **`using` uvnitř lambdy `Select`**: prostředek se uvolní při návratu lambdy, tedy dřív, než asynchronní operace skončí. Sdílený klient patří mimo lambdu.
- **Výsledek `WhenAny` brán jako úspěch**: první hotová úloha může být chybná nebo zrušená. Kontrolujte `IsCompletedSuccessfully`.
- **Nezrušené a nepozorované zbylé úlohy**: běží dál, spotřebovávají zdroje a jejich výjimky zmizí.
- **Opakovaný výčet líného `Select`**: každý výčet spustí operace znovu; materializujte přes `ToArray()`.
- **Sdílený `DbContext` v souběžných úlohách**: není bezpečný pro souběh.

---

<details>
<summary>Volitelné podrobnosti: WaitAll a mnoho úloh</summary>

### Task.WaitAll vs Task.WhenAll

**Fragment.**

```csharp
Task.WaitAll(ulohaA, ulohaB);      // Blokuje volající vlákno a vyhodí AggregateException.
await Task.WhenAll(ulohaA, ulohaB); // Asynchronní čekání; await vyhodí první výjimku.
```

`Task.WaitAll` na serveru zabírá vlákno ThreadPoolu a v UI aplikaci zamrazí okno; se synchronizačním kontextem může uváznout.

<span id="výkon-při-mnoha-taskcích"></span>

### Výkon při mnoha úlohách

Úloha a stavový automat pro každou položku jsou malé, ale tisíce souběžně běžících operací zatíží hlavně **cíl**: databázi, API nebo sokety. Rozhodující je tedy limit souběžnosti, ne počet alokací:

**Fragment s kolekcí `polozky` a vlastní `ZpracujAsync`.**

```csharp
await Parallel.ForEachAsync(polozky,
    new ParallelOptions { MaxDegreeOfParallelism = 10, CancellationToken = ct },
    async (polozka, token) => await ZpracujAsync(polozka, token));
```

</details>
