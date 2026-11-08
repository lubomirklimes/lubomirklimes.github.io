# Interakce mezi asynchronním a synchronním kódem

Na hranici mezi synchronním a asynchronním kódem vznikají uváznutí (deadlock), vyhladovění ThreadPoolu a ztracené výjimky. Základní pravidlo: **neblokujte asynchronní kód synchronním čekáním** a nespouštějte úlohy, jejichž výsledek nikdo nepozoruje. Pokud hranici obejít nejde, udělejte ji na jednom místě a vědomě.

**Prostředí:** .NET 10 / C# 14. Role synchronizačního kontextu je vysvětlena v [ConfigureAwait](ConfigureAwait.md).

## 1. Princip :id=_1-koncept

### Proč blokování async kódu způsobuje deadlock

S jednovláknovým synchronizačním kontextem (WPF, WinForms, klasické ASP.NET) nastane:

1. Vlákno kontextu zavolá `NactiAsync().Result` a zablokuje se.
2. `NactiAsync` po dokončení vnitřní operace chce pokračovat **v zachyceném kontextu**, tedy na blokovaném vlákně.
3. Vlákno čeká na úlohu, úloha čeká na vlákno. Nic se nepohne.

ASP.NET Core a konzolové aplikace takový kontext nemají, tento konkrétní deadlock tam nevznikne. Synchronní čekání ale i tam blokuje vlákno ThreadPoolu; při zátěži vede k **vyhladovění** (pokračování čekají ve frontě, protože všechna vlákna blokují), a to se navenek chová jako zamrznutí. Uváznout lze i jinak, například držením zámku, na který čeká pokračování.

## 2. Příklad

### Nebezpečné vzory

**Jednotlivé výrazy v synchronní metodě; `StahniAsync` je vlastní asynchronní metoda.**

```csharp
string a = StahniAsync().Result;                    // S kontextem deadlock, jinak blokované vlákno.
string b = StahniAsync().GetAwaiter().GetResult();  // Totéž; jen vyhodí původní výjimku místo AggregateException.
StahniAsync().Wait();                               // Totéž bez výsledku.
_ = StahniAsync();                                  // Nikdo nečeká ani nepozoruje výjimku.
```

### Správné řešení – async celou cestou

**Fragmenty; `StahniAsync` přijímá token.**

```csharp
// Asynchronní volající až k vstupnímu bodu.
public async Task<string> ZiskejDataAsync(CancellationToken ct) => await StahniAsync(ct);

// Vstupní bod konzolové aplikace (top-level příkazy) může awaitovat přímo.
await SpustAplikaciAsync(args);
```

Obslužná metoda události v UI je `async void` s `try/catch`, controller a endpoint vrací `Task`. Žádná vrstva mezi nimi nepotřebuje `.Result`.

<span id="kdy-nelze-jít-async-bezpečné-výjimky"></span>

### Kde async nejde přímo – konstruktor a úklid

Konstruktor nemůže být asynchronní; použijte tovární metodu, která instanci vrátí až po přípravě. Pro asynchronní úklid implementujte `IAsyncDisposable`:

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`.

```csharp
var sluzba = await PeriodickaSluzba.SpustAsync(TimeSpan.FromMilliseconds(20), CancellationToken.None);
await using (sluzba)
{
    await Task.Delay(150);
    Console.WriteLine($"Proběhly tiky: {sluzba.Tiku > 0}");
}
Console.WriteLine($"Úloha na pozadí dokončena: {sluzba.Dokonceno}");

public sealed class PeriodickaSluzba : IAsyncDisposable
{
    private readonly CancellationTokenSource _cts = new();
    private Task _pozadi = Task.CompletedTask;
    private int _tiku;

    private PeriodickaSluzba() { }

    public int Tiku => Volatile.Read(ref _tiku);
    public bool Dokonceno => _pozadi.IsCompleted;

    public static async Task<PeriodickaSluzba> SpustAsync(TimeSpan interval, CancellationToken ct)
    {
        var sluzba = new PeriodickaSluzba();
        await Task.Yield(); // Zde by proběhla asynchronní příprava, například načtení konfigurace.
        ct.ThrowIfCancellationRequested();
        sluzba._pozadi = sluzba.BezAsync(interval, sluzba._cts.Token);
        return sluzba;
    }

    private async Task BezAsync(TimeSpan interval, CancellationToken ct)
    {
        using var casovac = new PeriodicTimer(interval);
        try
        {
            while (await casovac.WaitForNextTickAsync(ct))
                Interlocked.Increment(ref _tiku);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Očekávané ukončení při DisposeAsync.
        }
    }

    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        try
        {
            await _pozadi; // Neočekávaná chyba úlohy na pozadí se projeví zde, nezmizí.
        }
        finally
        {
            _cts.Dispose();
        }
    }
}
```

Výstup: `Proběhly tiky: True` a `Úloha na pozadí dokončena: True`. Úloha na pozadí má vlastníka, který ji zruší, počká na ni a uvidí její chybu. V aplikaci s hostitelem je pro totéž připravena `BackgroundService`.

### Volání async z legacy synchronního kódu

Pokud synchronní vstupní bod (starý framework, synchronní rozhraní třetí strany) opravdu nelze změnit, blokujte **jednou, co nejvýš** a bez zachyceného kontextu:

**Implementace synchronního rozhraní, které nelze změnit.**

```csharp
public string ZiskejData() // Vynucené synchronní rozhraní.
{
    // Task.Run spustí asynchronní kód na ThreadPoolu bez synchronizačního kontextu volajícího.
    return Task.Run(() => StahniAsync(CancellationToken.None)).GetAwaiter().GetResult();
}
```

Volající vlákno přesto po celou dobu blokuje, na serveru ubírá vlákno ThreadPoolu a v UI zamrazí okno. Kód uvnitř nesmí potřebovat UI vlákno ani `HttpContext` z klasického ASP.NET. Jde o přechodné řešení, ne vzor.

<span id="nitoasyncex-pro-konzolové-async-kontexty"></span>

### Nito.AsyncEx a vlastní kontext

Knihovna třetí strany Nito.AsyncEx nabízí `AsyncContext.Run`, který vytvoří jednovláknový kontext a pumpuje jeho frontu, dokud asynchronní práce neskončí. Hodí se pro starý kód nebo testy, které potřebují napodobit UI vlákno. V moderní konzolové aplikaci stačí `async` vstupní bod. Princip podobného kontextu ukazuje ověřený příklad v kapitole [ConfigureAwait](ConfigureAwait.md).

## 3. Kdy použít

- **Async celou cestou**: výchozí řešení pro nový kód i úpravy existujícího.
- **Tovární metoda a `IAsyncDisposable`**: asynchronní příprava a úklid objektu.
- **Jediné blokování na okraji**: jen u synchronního rozhraní, které nelze změnit, s `Task.Run` a vědomím ceny.
- **Úloha na pozadí s vlastníkem**: hostovaná služba nebo objekt, který úlohu zruší a počká na ni.

## 4. Časté chyby

- **`.Result` nebo `.Wait()` uvnitř asynchronní metody**: zbytečně blokuje a s kontextem uvázne; použijte `await`.
- **`async void` pro „spusť a zapomeň“**: výjimka shodí proces. `ConfigureAwait(false)` na zahozené úloze (`_ = UlohaAsync().ConfigureAwait(false)`) výjimku také neošetří, jen ovlivní kontext.
- **Synchronní inicializace v konstruktoru přes `.Result`**: s kontextem deadlock a výjimky zabalené do `AggregateException`.
- **Předpoklad „bez kontextu žádný deadlock“**: vyhladovění ThreadPoolu a zámky mohou aplikaci zastavit i v ASP.NET Core.
- **`Thread.Sleep` v asynchronním kódu**: blokuje vlákno; použijte `await Task.Delay`.

---

<details>
<summary>Volitelné podrobnosti: Task.Run, vstupní body a diagnostika</summary>

<span id="proč-taskrun-eliminuje-deadlock"></span>

### Proč Task.Run obejde deadlock kontextu

Lambda v `Task.Run` běží na vlákně ThreadPoolu, kde `SynchronizationContext.Current` je `null`. `await` uvnitř tedy nezachytí kontext UI a pokračování může běžet na libovolném vlákně ThreadPoolu, i když původní vlákno blokuje.

**Schéma průběhu.**

```text
UI vlákno: Task.Run(lambda).GetAwaiter().GetResult()   ← blokuje
  ThreadPool: lambda → await StahniAsync()               ← bez kontextu
  ThreadPool: pokračování po dokončení I/O                ← nepotřebuje UI vlákno
UI vlákno: GetResult se vrátí
```

Deadlock zmizí, blokování ne. Pokud by vnitřní kód vyžadoval UI vlákno (například `Dispatcher.Invoke`), uvázne znovu.

### Async Main v různých kontextech

**Alternativní vstupní body a test xUnit.**

```csharp
// Top-level příkazy (C# 9+): await přímo v Program.cs.
await SpustAsync();

// Explicitní Main (C# 7.1+).
static async Task<int> Main(string[] args) => await SpustAsync(args);

// xUnit podporuje asynchronní testy přímo, bez blokování.
[Fact]
public async Task NacteData()
{
    var data = await _sluzba.NactiAsync(CancellationToken.None);
    Assert.NotNull(data);
}
```

### Diagnostika deadlocku

Pokud aplikace zamrzne bez výjimky:

1. V debuggeru zastavte všechna vlákna (Break All) a otevřete okno **Parallel Stacks**; v provozu pořiďte výpis paměti `dotnet-dump collect`.
2. Hledejte vlákno blokované v `Task.Wait`, `GetResult` nebo `Monitor.Enter` a pokračování, které čeká ve frontě kontextu nebo ThreadPoolu.
3. V `dotnet-dump analyze` ukáže `clrstack -all` zásobníky všech vláken a `dumpasync` stav nedokončených asynchronních operací.
4. Rostoucí fronta ThreadPoolu v metrikách ukazuje spíše na vyhladovění než na klasický deadlock.

</details>
