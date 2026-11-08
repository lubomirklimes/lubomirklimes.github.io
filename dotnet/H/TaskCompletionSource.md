# Pokročilé použití `TaskCompletionSource`

`TaskCompletionSource<T>` (TCS) vytvoří `Task<T>`, jehož dokončení řídíte ručně. **Nespouští žádnou práci**: jen reprezentuje okamžik, kdy něco jiného skončí. Hodí se pro převod API s callbacky nebo událostmi na úlohu a pro jednorázové asynchronní signály.

**Prostředí:** .NET 10 / C# 14. Negenerická varianta `TaskCompletionSource` (bez výsledku) existuje od .NET 5.

## 1. Princip :id=_1-koncept

Úlohu `tcs.Task` dokončí právě jedno z volání `SetResult`, `SetException` nebo `SetCanceled`. Varianty `TrySet*` vrátí `false`, pokud už byla úloha dokončena; použijte je všude, kde mohou soupeřit dva zdroje dokončení (callback, zrušení, časový limit).

`TaskCreationOptions.RunContinuationsAsynchronously` určuje, kde poběží pokračování těch, kdo na úlohu čekají:

- **bez volby** se mohou spustit synchronně přímo uvnitř volání `SetResult`, na vlákně, které úlohu dokončuje. Pokud toto vlákno drží zámek nebo je to vlákno knihovny (I/O callback), cizí kód poběží v jeho kontextu; hrozí uváznutí nebo zdržení.
- **s volbou** se pokračování naplánují na ThreadPool. Stojí to přeplánování navíc, ale dokončující kód je předvídatelný. Pro obecné použití je to bezpečnější výchozí volba.

## 2. Příklad

### Adaptace callback API na Task

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`; ukazuje výsledek i zrušení. `LegacyZarizeni` zastupuje knihovnu s callbacky.

```csharp
Console.WriteLine(await ZmerAsync(new LegacyZarizeni(), CancellationToken.None));

using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(20));
try { await ZmerAsync(new LegacyZarizeni(zpozdeniMs: 1000), cts.Token); }
catch (OperationCanceledException) { Console.WriteLine("Měření zrušeno."); }

static async Task<int> ZmerAsync(LegacyZarizeni zarizeni, CancellationToken ct)
{
    var tcs = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
    // Registrace se uvolní po skončení metody, ať úspěchem, chybou, nebo zrušením.
    using CancellationTokenRegistration registrace = ct.Register(() => tcs.TrySetCanceled(ct));
    zarizeni.ZacniMereni(
        hotovo: hodnota => tcs.TrySetResult(hodnota), // Callback a zrušení mohou soupeřit.
        chyba: e => tcs.TrySetException(e));
    return await tcs.Task;
}

sealed class LegacyZarizeni(int zpozdeniMs = 10)
{
    public void ZacniMereni(Action<int> hotovo, Action<Exception> chyba) =>
        ThreadPool.QueueUserWorkItem(_ =>
        {
            Thread.Sleep(zpozdeniMs); // Simulace zařízení.
            hotovo(42);
        });
}
```

Výstup: `42` a `Měření zrušeno.` Zrušení ukončí jen **čekání**; zařízení měří dál a jeho pozdní callback už nic nezmění (`TrySetResult` vrátí `false`). Pokud původní API zrušení podporuje, zavolejte je v callbacku registrace.

### Jednorázová událost jako Task

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`.

```csharp
var brana = new JednorazovaBrana();
Task cekajici = Task.WhenAll(Enumerable.Range(0, 3).Select(_ => brana.CekejAsync()));
Console.WriteLine($"Před otevřením hotovo: {cekajici.IsCompleted}");
Console.WriteLine($"První otevření: {brana.Otevri()}, druhé: {brana.Otevri()}");
await cekajici.WaitAsync(TimeSpan.FromSeconds(5));
Console.WriteLine("Všichni čekající pokračují.");

sealed class JednorazovaBrana
{
    private readonly TaskCompletionSource _tcs = new(TaskCreationOptions.RunContinuationsAsynchronously);

    // WaitAsync zruší čekání jednoho volajícího, ne bránu pro ostatní.
    public Task CekejAsync(CancellationToken ct = default) => _tcs.Task.WaitAsync(ct);
    public bool Otevri() => _tcs.TrySetResult();
}
```

Výstup: `Před otevřením hotovo: False`, `První otevření: True, druhé: False`, `Všichni čekající pokračují.` Typické použití je „aplikace je připravená“ nebo „spojení navázáno“. Opakovaně použitelný signál s metodou `Reset` je náchylný k závodům (čekající může dostat starou nebo novou úlohu); pro opakované události použijte `Channel<T>` nebo `SemaphoreSlim`.

<span id="timeout-wrapper-pomocí-tcs"></span>

### Časový limit bez vlastního TCS

**Fragment s úlohou `uloha` a tokenem `ct`.**

```csharp
try
{
    int vysledek = await uloha.WaitAsync(TimeSpan.FromSeconds(5), ct);
}
catch (TimeoutException)
{
    // Vypršel limit; zrušení volajícím by vyhodilo OperationCanceledException.
}
```

`WaitAsync` (.NET 6+) nahrazuje ruční kombinaci TCS, registrace a `WhenAny`, a odlišuje časový limit od zrušení. Původní `uloha` běží dál; pokud ji lze zrušit, předejte jí token s `CancelAfter` (viz [CancellationToken](CancellationToken.md)).

### SetResult vs TrySetResult

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`.

```csharp
var tcs = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
Console.WriteLine(tcs.TrySetResult(1));
Console.WriteLine(tcs.TrySetResult(2)); // Úloha je už dokončená, výsledek se nezmění.
try { tcs.SetResult(3); }
catch (InvalidOperationException) { Console.WriteLine("SetResult podruhé selhal."); }
Console.WriteLine(await tcs.Task);
```

Výstup: `True`, `False`, `SetResult podruhé selhal.`, `1`. `SetResult` použijte jen tam, kde druhé dokončení znamená chybu programu.

## 3. Kdy použít

- **Callbacky a události**: knihovny bez asynchronního API, `Process.Exited`, události zařízení nebo protokolu.
- **Jednorázové signály**: připravenost aplikace, první zpráva, dokončení inicializace.
- **Párování požadavků a odpovědí** v protokolu nad jedním spojením.

Kdy ne: pokud lze napsat `async` metodu nebo použít existující asynchronní API, je to jednodušší. Proud hodnot patří do `Channel<T>`, omezení souběžnosti do `SemaphoreSlim`.

## 4. Časté chyby

- **Chybějící `RunContinuationsAsynchronously`**: kód čekajících běží uvnitř `SetResult` na cizím vlákně.
- **`SetResult` při možném souběhu**: druhé dokončení vyhodí `InvalidOperationException`; použijte `TrySet*`.
- **Neuvolněná registrace zrušení**: `ct.Register` bez `Dispose` drží TCS i callback, dokud žije zdroj tokenu.
- **Úloha, která nikdy neskončí**: pokud callback za určitých podmínek nepřijde, čekající visí; doplňte zrušení nebo časový limit.
- **Záměna časového limitu a zrušení volajícím**: obojí se pak hlásí stejnou výjimkou a nelze správně reagovat.

---

<details>
<summary>Volitelné podrobnosti: párování odpovědí, zámky a srovnání primitiv</summary>

<span id="tcs-v-signalr-čekání-na-odpověď"></span>

### Párování požadavků a odpovědí

Klienti protokolů typu RPC (například pro volání s návratovou hodnotou přes jedno WebSocket spojení) drží slovník čekajících TCS podle ID zprávy. Zjednodušený princip:

**Členy třídy klienta; `Odesli` je vlastní metoda zápisu do spojení.**

```csharp
private readonly ConcurrentDictionary<string, TaskCompletionSource<string>> _cekajici = new();

public async Task<string> VolejAsync(string zprava, CancellationToken ct)
{
    string id = Guid.NewGuid().ToString("N");
    var tcs = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
    _cekajici[id] = tcs; // Nejdřív vložit, teprve pak registrovat zrušení a odeslat.
    using var registrace = ct.Register(() =>
    {
        if (_cekajici.TryRemove(id, out var zruseny)) zruseny.TrySetCanceled(ct);
    });
    try
    {
        await Odesli(id, zprava, ct);
        return await tcs.Task;
    }
    finally
    {
        _cekajici.TryRemove(id, out _); // Úklid i po chybě odeslání.
    }
}

public void PriOdpovedi(string id, string odpoved)
{
    if (_cekajici.TryRemove(id, out var tcs)) tcs.TrySetResult(odpoved);
}
```

Odpověď, která nepřijde, by bez tokenu čekala navždy; volající má vždy předat token s časovým limitem. Při ztrátě spojení dokončete všechny čekající výjimkou.

<span id="vlastní-asynclock-pomocí-tcs"></span>

### Vzájemné vyloučení: SemaphoreSlim místo vlastního zámku

Pro asynchronní zámek není potřeba stavět vlastní primitivum z TCS. `SemaphoreSlim(1, 1)` s `WaitAsync` a uvolněním ve `finally` je ověřené a podporuje zrušení:

**Fragment s polem `_zamek = new SemaphoreSlim(1, 1)`.**

```csharp
await _zamek.WaitAsync(ct);
try { await UpravSdilenyStavAsync(ct); }
finally { _zamek.Release(); }
```

`SemaphoreSlim` není reentrantní: stejný tok kódu jej nesmí získat podruhé, než jej uvolní.

### TCS vs Channel vs SemaphoreSlim

| Potřeba | Doporučení |
|---|---|
| Jednorázový signál nebo převod callbacku | `TaskCompletionSource` |
| Proud zpráv mezi producentem a spotřebitelem | `Channel<T>` |
| Omezení souběžnosti, vzájemné vyloučení | `SemaphoreSlim` |
| Časový limit čekání | `Task.WaitAsync` |

</details>
