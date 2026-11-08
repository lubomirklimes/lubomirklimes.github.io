# ConfigureAwait a synchronizační kontext

`ConfigureAwait(false)` u jednoho `await` říká: „pokračování nemusí běžet v zachyceném kontextu“. Nic víc. Neodblokuje vlákno, které čeká přes `.Result`, nezaručí přepnutí na jiné vlákno a v aplikacích bez synchronizačního kontextu nemá viditelný účinek.

**Prostředí:** .NET 10 / C# 14. Základní mechanismus `await` popisuje [Pokročilé async/await](Async_await_pokrocile.md).

## 1. Princip :id=_1-koncept

Při `await` nad nedokončenou úlohou se zachytí **kontext**, do kterého se má pokračování vrátit:

- `SynchronizationContext.Current`, pokud existuje: ve WPF, WinForms, MAUI je to UI vlákno; v klasickém ASP.NET (.NET Framework) kontext požadavku, který zajišťoval přístup k `HttpContext` a vždy jen jedno pokračování naráz.
- jinak `TaskScheduler.Current`, pokud není výchozí,
- jinak se pokračování spustí na ThreadPoolu.

ASP.NET Core, konzolové aplikace a hostované služby synchronizační kontext nemají. `ExecutionContext` (například `AsyncLocal<T>`) se přenáší vždy a `ConfigureAwait` jej neovlivní.

Je-li očekávaná úloha už hotová, kód pokračuje synchronně na stejném vlákně bez ohledu na `ConfigureAwait`.

## 2. Příklad

### Deadlock v UI aplikaci

Následující ukázka napodobí UI vlákno vlastním jednovláknovým kontextem a ukáže, kam se pokračování vrací a proč blokující čekání uvázne. Místo skutečného deadlocku čeká s časovým limitem.

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`; vypíše čtyři řádky. Kontext je zjednodušená demonstrace, ne implementace WPF.

```csharp
using System.Collections.Concurrent;

new JednovlaknovyKontext().Spust(async () =>
{
    int vlaknoKontextu = Environment.CurrentManagedThreadId;
    await Task.Delay(10);
    Console.WriteLine($"Bez ConfigureAwait na vlákně kontextu: {Environment.CurrentManagedThreadId == vlaknoKontextu}");
    await Task.Delay(10).ConfigureAwait(false);
    Console.WriteLine($"S ConfigureAwait(false) na vlákně kontextu: {Environment.CurrentManagedThreadId == vlaknoKontextu}");
});

new JednovlaknovyKontext().Spust(() =>
{
    // Blokující čekání na vlákně kontextu: pokračování CekejAsync čeká ve frontě právě tohoto vlákna.
    Console.WriteLine($"Dokončeno během blokování: {CekejAsync().Wait(TimeSpan.FromMilliseconds(300))}");
    // Bez zachycení kontextu se úloha dokončí, vlákno ale stejně po celou dobu blokovalo.
    Console.WriteLine($"S ConfigureAwait(false) dokončeno: {CekejBezKontextuAsync().Wait(TimeSpan.FromSeconds(5))}");
    return Task.CompletedTask;
});

static async Task CekejAsync() => await Task.Delay(10);
static async Task CekejBezKontextuAsync() => await Task.Delay(10).ConfigureAwait(false);

sealed class JednovlaknovyKontext : SynchronizationContext
{
    private readonly BlockingCollection<(SendOrPostCallback Akce, object? Stav)> _fronta = new();

    public override void Post(SendOrPostCallback d, object? state) => _fronta.Add((d, state));

    public void Spust(Func<Task> prace)
    {
        SynchronizationContext? predchozi = Current;
        SetSynchronizationContext(this);
        try
        {
            Task uloha = prace();
            uloha.ContinueWith(_ => _fronta.CompleteAdding(), TaskScheduler.Default);
            foreach (var (akce, stav) in _fronta.GetConsumingEnumerable()) akce(stav); // Smyčka zpráv.
            uloha.GetAwaiter().GetResult();
        }
        finally
        {
            SetSynchronizationContext(predchozi);
        }
    }
}
```

Výstup v pořadí řádků: `True`, `False`, `False`, `True`. Ve skutečné UI aplikaci by `.Result` nebo `.Wait()` bez limitu na UI vlákně uvázl natrvalo. Oprava je **async celou cestou**: obslužná metoda události volá `await`, nikoli `.Result`. `ConfigureAwait(false)` v knihovně deadlock zmírní, jen pokud jej má *každý* `await` v celém řetězci, a i pak UI vlákno zamrzne po dobu čekání.

### Správné použití v knihovním kódu

**Třída knihovny s balíčkem `System.Net.Http.Json` (součást .NET).**

```csharp
public sealed class DataKlient(HttpClient http)
{
    public async Task<T?> ZiskejAsync<T>(Uri adresa, CancellationToken ct = default)
    {
        using var odpoved = await http.GetAsync(adresa, ct).ConfigureAwait(false);
        odpoved.EnsureSuccessStatusCode();
        return await odpoved.Content.ReadFromJsonAsync<T>(ct).ConfigureAwait(false);
    }
}
```

Knihovna nezná prostředí volajícího a UI vlákno nepotřebuje; nezachytávání kontextu ušetří zařazení do jeho fronty. Ovlivní jen daný `await`: pokud se úloha dokončí synchronně, kód zůstává v původním kontextu a další `await` bez `ConfigureAwait(false)` jej zachytí.

<span id="aspnet-core-configureawait-nemá-efekt"></span>

### ASP.NET Core – žádný synchronizační kontext

**Controller s vlastním `IProduktRepo`.**

```csharp
[ApiController]
[Route("produkty")]
public sealed class ProduktController(IProduktRepo repo) : ControllerBase
{
    [HttpGet("{id:int}")]
    public async Task<IActionResult> Ziskej(int id, CancellationToken ct)
    {
        var produkt = await repo.NactiAsync(id, ct); // ConfigureAwait zde nic nemění.
        return produkt is null ? NotFound() : Ok(produkt);
    }
}
```

V kódu aplikace ASP.NET Core `ConfigureAwait(false)` nepotřebujete. Pokud je stejný kód sdílen jako knihovna i do UI aplikací, ponechte jej v knihovně.

## 3. Kdy použít

- **Knihovny pro obecné použití** (NuGet, sdílené vrstvy): `ConfigureAwait(false)` u každého `await`, pokud kód po něm nepotřebuje kontext volajícího.
- **UI vrstva** (obslužné metody, ViewModel): bez `ConfigureAwait(false)`; po `await` se pracuje s ovládacími prvky.
- **ASP.NET Core a konzolové aplikace**: není potřeba; nepřidávejte jej plošně kvůli „konzistenci“.
- **Servisní vrstva desktopové aplikace**: `ConfigureAwait(false)` ušetří přepínání na UI vlákno, ale nenahradí opravu blokujícího volajícího.

## 4. Časté chyby

- **Spoléhání, že `ConfigureAwait(false)` opraví `.Result`**: volající vlákno blokuje dál; v UI zamrzne, na serveru ubírá vlákna ThreadPoolu. Viz [async a sync kód](Async_Sync_Interop.md).
- **Práce s UI po `ConfigureAwait(false)`**: pokračování může běžet mimo UI vlákno a přístup k ovládacímu prvku selže výjimkou.
- **Předpoklad, že kód „přejde na ThreadPool“**: u hotové úlohy kód pokračuje synchronně v původním kontextu.
- **Chybějící `ConfigureAwait(false)` u jednoho z mnoha `await` v knihovně**: od tohoto místa se může pokračovat v kontextu volajícího.

---

<details>
<summary>Volitelné podrobnosti: implementace kontextů a analyzátory</summary>

### SynchronizationContext a jeho implementace

`SynchronizationContext.Current` je hodnota vázaná na vlákno. Výchozí awaiter úlohy si ji při pozastavení uloží a pokračování naplánuje voláním `Post`.

- **WPF**: `DispatcherSynchronizationContext` zařadí pokračování do fronty Dispatcheru (smyčka zpráv UI vlákna).
- **WinForms**: `WindowsFormsSynchronizationContext` použije frontu zpráv okna.
- **Klasické ASP.NET**: `AspNetSynchronizationContext` obnovoval kontext požadavku; pokračování mohlo běžet na jiném vlákně, ale ne souběžně s jiným pro stejný požadavek.
- **ASP.NET Core**: `SynchronizationContext.Current` je `null`.

### Co ConfigureAwait(false) technicky dělá :id=configureawaitfalse-vs-valuetask

`task.ConfigureAwait(false)` vrátí `ConfiguredTaskAwaitable`, jehož awaiter při pozastavení nezachytí kontext a pokračování naplánuje na ThreadPool. Stejné metody mají i `ValueTask`, `IAsyncEnumerable<T>` (u `await foreach`) a `IAsyncDisposable` (u `await using`). Od .NET 8 existuje přetížení s `ConfigureAwaitOptions`, například `SuppressThrowing` (počkat bez vyhození výjimky) nebo `ForceYielding` (vždy pozastavit).

### Analyzátory kódu

Pravidlo CA2007 z vestavěných .NET analyzátorů hlásí `await` bez `ConfigureAwait`. Zapněte je jen v projektech knihoven, kde je to záměr:

**Soubor `.editorconfig` v adresáři knihovny.**

```text
[*.cs]
dotnet_diagnostic.CA2007.severity = warning
```

</details>
