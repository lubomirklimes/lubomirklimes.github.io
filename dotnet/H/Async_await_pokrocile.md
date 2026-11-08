# Pokročilé techniky s `async` a `await`

Tato kapitola navazuje na [základy async/await](../B/Async_await.md) a vysvětluje, co se při `await` skutečně děje: kdy metoda pokračuje synchronně, kam se plánuje pokračování, co se přenáší mezi vlákny a jak se chovají výjimky při souběžných úlohách.

**Prostředí:** .NET 10 / C# 14. `async` řeší čekání (typicky I/O), ne paralelní výpočet; CPU práci popisuje [TPL a PLINQ](TPL_PLINQ.md).

## 1. Princip :id=_1-koncept

Překladač z `async` metody vytvoří **stavový automat**. U každého `await` se zeptá, zda je očekávaná operace hotová:

- **Hotová** (například výsledek z cache): metoda pokračuje hned, synchronně, na stejném vlákně.
- **Nehotová**: metoda zaregistruje pokračování a vrátí volajícímu nedokončený `Task`. Vlákno se uvolní.

Kam se pokračování naplánuje, určuje **zachycený kontext**: aktuální `SynchronizationContext` (UI vlákno ve WPF/WinForms), jinak aktuální `TaskScheduler`, jinak ThreadPool. ASP.NET Core ani konzolová aplikace synchronizační kontext nemají. `ConfigureAwait(false)` zachycení kontextu vypne.

Odlišný pojem je **`ExecutionContext`**: nese například hodnoty `AsyncLocal<T>` a kulturu a přenáší se přes `await` vždy, i s `ConfigureAwait(false)`.

## 2. Příklad

### Základní použití

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`.

```csharp
var kontext = new AsyncLocal<string>();
kontext.Value = "pozadavek-42";
int vlakno = Environment.CurrentManagedThreadId;

await Task.CompletedTask; // Hotová úloha: žádné přeplánování.
Console.WriteLine($"Stejné vlákno po hotové úloze: {vlakno == Environment.CurrentManagedThreadId}");

await Task.Delay(10); // Skutečné čekání; pokračování může běžet na jiném vlákně.
Console.WriteLine($"AsyncLocal po await: {kontext.Value}");
```

Výstup: `Stejné vlákno po hotové úloze: True` a `AsyncLocal po await: pozadavek-42`. Na kterém vlákně běží kód po `Task.Delay`, se nezaručuje a nemá to vliv na správnost.

### `async void` vs `async Task`

**Obslužná metoda události ve WinForms; `NactiDataAsync` a `ZobrazChybu` jsou vlastní metody.**

```csharp
private async void Nacist_Click(object? sender, EventArgs e)
{
    try
    {
        await NactiDataAsync();
    }
    catch (Exception ex)
    {
        ZobrazChybu(ex); // Výjimku z async void nelze zachytit u volajícího.
    }
}
```

`async void` nevrací úlohu: volající nemůže počkat na dokončení ani zachytit výjimku, nezachycená výjimka se vyhodí na synchronizačním kontextu a typicky ukončí aplikaci. Používejte jej jen pro obslužné metody událostí; ostatní metody vracejí `Task`.

### Paralelní spuštění více úloh

**Metoda služby se sdíleným `HttpClient http` (například z `IHttpClientFactory`).**

```csharp
public async Task<string[]> StahniVsechnyAsync(IReadOnlyList<Uri> adresy, CancellationToken ct)
{
    using var limit = new SemaphoreSlim(4); // Nejvýš čtyři požadavky současně.
    Task<string>[] ulohy = adresy.Select(async adresa =>
    {
        await limit.WaitAsync(ct);
        try { return await http.GetStringAsync(adresa, ct); }
        finally { limit.Release(); }
    }).ToArray(); // Materializace spustí úlohy právě jednou.
    return await Task.WhenAll(ulohy); // Pořadí výsledků odpovídá pořadí adres.
}
```

Bez limitu by tisíc adres znamenalo tisíc souběžných požadavků. `Select` je líný: úlohy vzniknou až při výčtu, opakovaný výčet by je spustil znovu. Souběžně lze volat jen to, co je pro souběh bezpečné; jeden `DbContext` takový není.

### Asynchronní inicializace objektu

Konstruktor nemůže být `async`. Asynchronní přípravu provede statická tovární metoda, která po selhání uvolní, co už otevřela:

**Třída s balíčkem `Microsoft.Data.SqlClient`; řetězec připojení dodá konfigurace.**

```csharp
public sealed class SluzbaSDatabazi : IAsyncDisposable
{
    private readonly SqlConnection _spojeni;
    private SluzbaSDatabazi(SqlConnection spojeni) => _spojeni = spojeni;

    public static async Task<SluzbaSDatabazi> VytvorAsync(string connectionString, CancellationToken ct)
    {
        var spojeni = new SqlConnection(connectionString);
        try
        {
            await spojeni.OpenAsync(ct);
            return new SluzbaSDatabazi(spojeni);
        }
        catch
        {
            await spojeni.DisposeAsync();
            throw;
        }
    }

    public ValueTask DisposeAsync() => _spojeni.DisposeAsync();
}
```

Ve webové aplikaci obvykle spojení nedržíte v objektu, ale otevíráte je krátce pro každou operaci; pool spojení zařídí znovupoužití.

## 3. Kdy použít

- **I/O operace** (síť, soubory, databáze): `async` uvolní vlákno po dobu čekání.
- **Nezávislé operace**: spusťte je souběžně a počkejte přes `Task.WhenAll`, s limitem, pokud jich může být mnoho.
- **CPU práce z UI**: `await Task.Run(...)` uvolní UI vlákno. Na serveru `Task.Run` kolem CPU práce propustnost nezvýší.
- **Zrušení**: token předávejte celým řetězcem volání, viz [CancellationToken](CancellationToken.md).

## 4. Časté chyby

- **`async void` mimo obslužné metody událostí**: výjimky a dokončení nelze sledovat.
- **`.Result` a `.Wait()`**: se synchronizačním kontextem hrozí deadlock, jinde zbytečné blokování a vyhladovění ThreadPoolu.
- **Fire-and-forget bez pozorování**: `_ = UlohaAsync()` výjimku nikam neohlásí. Na pozadí použijte hostovanou službu nebo frontu s logováním chyb.
- **Nový `HttpClient` pro každé volání**: použijte sdílený klient nebo `IHttpClientFactory`.
- **Neomezený fan-out**: `WhenAll` nad tisíci úloh přetíží cílový systém; omezte souběžnost.
- **Sekvenční `await` nezávislých operací**: celková doba je součtem; souběh pomůže, pokud to cíl unese.

---

<details>
<summary>Volitelné podrobnosti: stavový automat, ConfigureAwait a výjimky</summary>

### Jak kompilátor transformuje async metodu

Metoda se přeloží na typ implementující `IAsyncStateMachine` s metodou `MoveNext()`, ve které je tělo rozdělené podle `await`. V konfiguraci Release je automat `struct`: pokud se metoda dokončí synchronně, žádný objekt automatu na haldě nevznikne. Při prvním skutečném pozastavení se automat přesune na haldu. V Debug je kvůli ladění třída. Hotový `Task<T>` se navíc alokuje, pokud runtime nemá výsledek v cache; tuto alokaci řeší [ValueTask](Task_ValueTask.md).

### ConfigureAwait(false)

`ConfigureAwait(false)` znamená „nezachycuj kontext pro pokračování“. Hodí se v knihovnách, které nepotřebují UI vlákno. Nezaručuje přechod na jiné vlákno (je-li úloha hotová, kód pokračuje synchronně) a nenahrazuje odstranění blokování. Podrobně: [ConfigureAwait](ConfigureAwait.md).

### Sekvenční vs. paralelní await

**Fragment s vlastními nezávislými metodami.**

```csharp
// Sekvenčně: B začne až po dokončení A.
var a = await ZiskejAAsync(ct);
var b = await ZiskejBAsync(ct);

// Souběžně: obě operace běží zároveň; WhenAll pozoruje výjimky obou.
Task<int> ulohaA = ZiskejAAsync(ct);
Task<int> ulohaB = ZiskejBAsync(ct);
await Task.WhenAll(ulohaA, ulohaB);
var (a2, b2) = (ulohaA.Result, ulohaB.Result); // Po WhenAll jsou obě hotové.
```

Zápis `(await ulohaA, await ulohaB)` při selhání A nepočká na B a jeho případnou výjimku nepozoruje. `WhenAll` je proto bezpečnější.

### Výjimky v Task.WhenAll

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`.

```csharp
Task vse = Task.WhenAll(SelzeAsync("A", 20), SelzeAsync("B", 10));
try
{
    await vse;
}
catch (InvalidOperationException e) // await vyhodí jednu výjimku, ne AggregateException.
{
    Console.WriteLine($"Zachyceno: {e.GetType().Name}");
    var vsechny = vse.Exception!.InnerExceptions.Select(x => x.Message).Order();
    Console.WriteLine($"Všechny chyby: {string.Join(", ", vsechny)}");
}

static async Task SelzeAsync(string nazev, int ms)
{
    await Task.Delay(ms);
    throw new InvalidOperationException(nazev);
}
```

Výstup: `Zachyceno: InvalidOperationException` a `Všechny chyby: A, B`. Úplný seznam drží vlastnost `Exception` vrácené úlohy, nikoli zachycená výjimka.

</details>

---

**Související kapitoly:**
- [Task a ValueTask](Task_ValueTask.md) – kdy použít `ValueTask` místo `Task`
- [ConfigureAwait](ConfigureAwait.md) – synchronizační kontext podrobně
- [CancellationToken](CancellationToken.md) – správné zrušení operací
- [Task orchestrace](Task_Orchestration.md) – `WhenAll`, `WhenAny`, timeouty
- [IAsyncEnumerable](IAsyncEnumerable.md) – asynchronní proudy dat
- [TaskCompletionSource](TaskCompletionSource.md) – ruční řízení dokončení `Task`
