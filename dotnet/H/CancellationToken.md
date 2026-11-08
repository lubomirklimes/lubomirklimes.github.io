# CancellationToken – zrušení asynchronních operací

`CancellationToken` předává žádost „výsledek už nepotřebuji, přestaň“. Zrušení je **kooperativní**: token nic násilně nepřeruší, operace se musí sama zastavit, uklidit po sobě a obvykle vyhodit `OperationCanceledException`.

**Prostředí:** .NET 10 / C# 14.

## 1. Princip :id=_1-koncept

- **`CancellationTokenSource`** (CTS) vlastní rozhodnutí o zrušení: volá `Cancel()` nebo nastaví časovač `CancelAfter`.
- **`CancellationToken`** je struktura, kterou předáváte dál; umí jen zjistit stav (`IsCancellationRequested`), vyhodit výjimku (`ThrowIfCancellationRequested`) a zaregistrovat callback.
- `default(CancellationToken)` a `CancellationToken.None` jsou totéž: token, který nikdy nebude zrušen.

Kontrakt metody, která token přijímá: pokud zrušení přijde včas, skončí co nejdříve výjimkou `OperationCanceledException` (nebo odvozenou `TaskCanceledException`). Pokud už byla operace hotová, smí vrátit výsledek. Zrušení **není transakce**: co už se zapsalo nebo odeslalo, se samo nevrátí.

Kdo vytvoří CTS, je vlastník: rozhoduje o zrušení a volá `Dispose`. Časový limit je rozhodnutí volaného kódu nebo volajícího; mají-li platit oba, propojte tokeny a výsledek rozlište.

## 2. Příklad

### Základní použití

**Fragment se sdíleným `HttpClient http`.**

```csharp
using var cts = new CancellationTokenSource();
Task<string> stahovani = http.GetStringAsync("https://example.com/", cts.Token);

cts.Cancel(); // Například uživatel stiskl Zrušit.
try
{
    string obsah = await stahovani;
}
catch (OperationCanceledException) when (cts.IsCancellationRequested)
{
    Console.WriteLine("Operace byla zrušena.");
}
```

Filtr `when` zajistí, že se jako „zrušení uživatelem“ ošetří jen zrušení z vlastního zdroje, ne například interní časový limit `HttpClient.Timeout`, který také vyhodí `TaskCanceledException`.

### Časový limit :id=timeout

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`; rozlišuje časový limit a zrušení volajícím.

```csharp
using var volajici = new CancellationTokenSource();
try { await SLimitemAsync(TimeSpan.FromMilliseconds(50), volajici.Token); }
catch (TimeoutException e) { Console.WriteLine(e.Message); }

volajici.Cancel();
try { await SLimitemAsync(TimeSpan.FromSeconds(5), volajici.Token); }
catch (OperationCanceledException) { Console.WriteLine("Zrušeno volajícím."); }

static async Task SLimitemAsync(TimeSpan limit, CancellationToken ct)
{
    using var casovac = CancellationTokenSource.CreateLinkedTokenSource(ct);
    casovac.CancelAfter(limit);
    try
    {
        await Task.Delay(Timeout.Infinite, casovac.Token); // Zastupuje pomalou operaci.
    }
    catch (OperationCanceledException) when (!ct.IsCancellationRequested)
    {
        // Zrušil vlastní časovač, ne volající: pro volajícího je to jiný druh chyby.
        throw new TimeoutException("Vypršel časový limit.");
    }
}
```

Výstup: `Vypršel časový limit.` a `Zrušeno volajícím.` Pro jednoduchý limit nad existující úlohou lze použít i `task.WaitAsync(limit, ct)`; ten ale přestane jen **čekat**, samotnou operaci nezastaví.

### Propojení tokenů (LinkedTokenSource)

**Endpoint minimal API; token parametru ASP.NET Core naváže na `HttpContext.RequestAborted`.**

```csharp
app.MapPost("/import", async (ImportSluzba sluzba, IHostApplicationLifetime zivot, CancellationToken ct) =>
{
    // Zruší se při odpojení klienta, při ukončování aplikace nebo po 30 s.
    using var spojeny = CancellationTokenSource.CreateLinkedTokenSource(ct, zivot.ApplicationStopping);
    spojeny.CancelAfter(TimeSpan.FromSeconds(30));
    await sluzba.ImportujAsync(spojeny.Token);
    return Results.NoContent();
});
```

### Ruční kontrola v CPU-bound kódu

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`; ukazuje stav zrušené úlohy.

```csharp
using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(50));
Task<long> vypocet = Task.Run(() => SectiDoZruseni(cts.Token), cts.Token);
try
{
    await vypocet;
}
catch (OperationCanceledException)
{
    Console.WriteLine($"Výpočet zrušen, stav úlohy: {vypocet.Status}");
}

static long SectiDoZruseni(CancellationToken ct)
{
    long soucet = 0;
    for (long i = 0; ; i++)
    {
        // Kontrola jednou za 65 536 kroků je levná a reakce na zrušení stále rychlá.
        if ((i & 0xFFFF) == 0) ct.ThrowIfCancellationRequested();
        soucet += i;
    }
}
```

Výstup: `Výpočet zrušen, stav úlohy: Canceled`. Token předaný do `Task.Run` sám výpočet nepřeruší: jen zabrání spuštění, pokud je už zrušen, a způsobí, že výjimka se stejným tokenem označí úlohu jako `Canceled` místo `Faulted`.

### Řízené ukončení v ASP.NET Core :id=graceful-shutdown-v-aspnet-core

**Hostovaná služba; `IFronta` a `ZpracujAsync` jsou vlastní typy a metody.**

```csharp
public sealed class ZpracovatelFronty(IFronta fronta, ILogger<ZpracovatelFronty> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var zprava in fronta.CtiAsync(stoppingToken))
            {
                await ZpracujAsync(zprava, stoppingToken);
                await zprava.PotvrdAsync(CancellationToken.None); // Krátké potvrzení dokončit i při ukončování.
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            log.LogInformation("Zpracování zastaveno při ukončování aplikace.");
        }
    }
}
```

Zpráva zrušená uprostřed zpracování zůstane nepotvrzená a broker ji doručí znovu; zpracování proto musí být idempotentní. Host čeká na doběhnutí služeb jen omezenou dobu (`HostOptions.ShutdownTimeout`, výchozí 30 s od .NET 6).

## 3. Kdy použít

- **Veřejné asynchronní metody**: přijměte `CancellationToken ct = default` jako poslední parametr a předejte jej všem vnořeným voláním.
- **Webové požadavky**: token parametru endpointu nebo `HttpContext.RequestAborted`; zastaví práci po odpojení klienta.
- **Hostované služby**: `stoppingToken` z `ExecuteAsync`.
- **Časové limity**: `CancelAfter` na vlastním propojeném zdroji, s rozlišením limitu od zrušení volajícím.
- **Zrušení z UI**: tlačítko Zrušit volá `Cancel()` na CTS vlastněném obrazovkou.

## 4. Časté chyby

- **Token přijatý, ale nepředaný**: metoda se tváří zrušitelně, ale vnitřní I/O běží dál.
- **Spolknutí `OperationCanceledException`**: volající pak považuje zrušenou operaci za úspěšnou. Zachyťte jen tam, kde zrušení skutečně ošetřujete, ideálně s filtrem podle vlastního tokenu.
- **Chytání `OperationCanceledException` jako obecné chyby**: zrušení není chyba k logování na úrovni Error ani důvod k opakování.
- **Zrušení uprostřed nevratného kroku**: rozdělte operaci tak, aby zrušení přišlo před zápisem, nebo použijte transakci či idempotentní zápis.
- **Chybějící `Dispose` u CTS s časovačem nebo propojením**: drží časovač a registrace na nadřazeném tokenu.

---

<details>
<summary>Volitelné podrobnosti: signalizace, callbacky a uvolnění</summary>

### Jak token signalizuje zrušení

`Cancel()` atomicky přepne stav zdroje a **synchronně** na volajícím vlákně spustí zaregistrované callbacky. Asynchronní API (sokety, `Task.Delay`, `SemaphoreSlim.WaitAsync`) si callback zaregistrují a při zrušení dokončí svou úlohu jako zrušenou. Token z `default` nebo `None` má `CanBeCanceled == false`, takže registrace i kontroly jsou levné.

### Registrace callbacku

**Fragment; `_klient` je vlastní objekt se synchronní metodou `Preruš`.**

```csharp
using CancellationTokenRegistration registrace = ct.Register(static stav => ((LegacyKlient)stav!).Preruš(), _klient);
await _klient.CekejNaDokonceniAsync();
// Dispose registrace odhlásí callback, aby po skončení operace už nemohl běžet.
```

Callback má být krátký a nemá vyhazovat výjimky: výjimky z callbacků se sesbírají a vyhodí z `Cancel()` jako `AggregateException`. Pokud je token v okamžiku registrace už zrušený, callback proběhne hned.

<span id="výkon-proč-ct-default-místo-null"></span>

### default a CancellationToken.None

`CancellationToken` je struktura, nemůže být `null`. Výchozí hodnota parametru `= default` je ekvivalentní `CancellationToken.None`; volba mezi nimi je otázka čitelnosti. Explicitní `CancellationToken.None` ve volání dává najevo záměr operaci nerušit (například krátké potvrzení po dokončené práci).

### Propojené tokeny a uvolnění :id=linked-tokens-a-memory

`CreateLinkedTokenSource` vytvoří nový zdroj a zaregistruje se u všech nadřazených tokenů. Bez `Dispose` zůstanou registrace na dlouho žijícím nadřazeném tokenu (například `ApplicationStopping`) a s nimi i propojený zdroj. CTS vytváří systémový handle jen při použití `WaitHandle`; časovač `CancelAfter` uvolní také až `Dispose`.

</details>
