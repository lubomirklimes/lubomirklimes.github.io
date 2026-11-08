# Async/await – základy

`async` a `await` umožňují skládat asynchronní operace bez blokujícího čekání. Samy nevytvářejí nové vlákno ani nezaručují, že celý obsah metody bude neblokující.

**Příklady:** .NET 10 / C# 14, `dotnet new console -f net10.0`. Samostatné příklady vložte jednotlivě do `Program.cs` a spusťte `dotnet run`; fragmenty jsou označené.

## 1. Princip :id=_1-koncept

Asynchronní metoda běží synchronně až do čekání na dosud nedokončenou operaci. Tehdy `await` umožní vrátit řízení volajícímu; pokračování se vykoná po dokončení operace. Je-li operace již hotová, `await` nemusí provádění přerušit. Výpočet ani synchronní I/O uvnitř metody nezmizí přidáním `async`.

- `Task` popisuje dokončení operace, `Task<T>` také její výsledek. Awaitovat lze i `ValueTask` / `ValueTask<T>` a další typy s odpovídajícím awaiterem.
- `IAsyncEnumerable<T>` je proud položek; čte se přes **`await foreach`**, nikoli `await proud`.
- Běžná async metoda vrací `Task` nebo `Task<T>`; `async void` patří zejména obsluze událostí, jejíž podpis vyžaduje `void`.

## 2. Příklad

### Základní async metoda

**Samostatný příklad**, bez sítě a dalších balíčků:

```csharp
static async Task<string> NactiAsync(CancellationToken ct)
{
    await Task.Delay(20, ct); // Jen simulace čekání, nikoli měření I/O.
    return "Hotovo";
}

using var zruseni = new CancellationTokenSource();
Console.WriteLine(await NactiAsync(zruseni.Token));
```

Výstup je `Hotovo`. Token umožňuje požádat o zrušení; operace jej musí podporovat. `await` předá výjimku volajícímu, při zrušení obvykle `OperationCanceledException`.

### Řetězení async volání

Každá vrstva má čekat asynchronně a předat token dál. U HTTP použijte opakovaně používaný klient s řízenou životností nebo `IHttpClientFactory`, ne nový `HttpClient` pro každý požadavek.

**Fragment služby**: klient dodává a vlastní hostitel; pro dlouho žijící klient nastavte také obnovování spojení podle [doporučení HttpClient](https://learn.microsoft.com/en-us/dotnet/fundamentals/networking/http/httpclient-guidelines).

```csharp
public sealed class WebSluzba(HttpClient client)
{
    public Task<string> NactiAsync(Uri adresa, CancellationToken ct) =>
        client.GetStringAsync(adresa, ct);
}
```

**Samostatný konzolový příklad proudu:**

```csharp
using System.Runtime.CompilerServices;

static async IAsyncEnumerable<int> CislaAsync(
    [EnumeratorCancellation] CancellationToken ct = default)
{
    for (int i = 1; i <= 2; i++)
    {
        await Task.Delay(10, ct);
        yield return i;
    }
}

await foreach (int cislo in CislaAsync())
    Console.WriteLine(cislo);
```

Výstup jsou řádky `1` a `2`.

### Paralelní čekání

**Samostatný příklad:** nezávislé operace lze rozběhnout před společným čekáním. Nezaručuje to konkrétní čas ani souběh na více vláknech.

```csharp
static async Task<string> ZiskejAsync(string jmeno)
{
    await Task.Delay(20);
    return jmeno;
}

Task<string> a = ZiskejAsync("A");
Task<string> b = ZiskejAsync("B");
string[] vysledky = await Task.WhenAll(a, b);
Console.WriteLine(string.Join(", ", vysledky));
```

Výstup `A, B` odpovídá pořadí vstupních úloh. `WhenAll` dokončí čekání až po všech úlohách; samo je při chybě jedné nezruší. Souběžně spuštěné operace musí sdílené objekty snést; například jeden EF Core `DbContext` souběžné dotazy nepodporuje.

### Async v ASP.NET Core

**Fragment pro webový projekt:** controller je třída, která obsluhuje HTTP požadavky; podrobně je zavádí kapitola [REST API](../E/REST_API.md). Hostitel musí zavolat `AddControllers`, registrovat `IUzivatele` a zavolat `MapControllers`. `ControllerBase` poskytuje `Ok` a `NotFound`.

```csharp
using Microsoft.AspNetCore.Mvc;

public interface IUzivatele
{
    Task<string?> NactiAsync(int id, CancellationToken ct);
}

[ApiController]
[Route("uzivatele")]
public sealed class UzivateleController(IUzivatele sluzba) : ControllerBase
{
    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id, CancellationToken ct)
    {
        string? jmeno = await sluzba.NactiAsync(id, ct);
        return jmeno is null ? NotFound() : Ok(jmeno);
    }
}
```

Token akce odpovídá přerušení požadavku. ASP.NET Core standardně nemá vlastní `SynchronizationContext`; `.Result` přesto blokuje vlákno a při zátěži může vyčerpat dostupná vlákna. Typický deadlock přes návrat do obsazeného kontextu se týká např. UI nebo klasického ASP.NET, nikoli automaticky ASP.NET Core.

## 3. Kdy použít

Preferujte asynchronní API pro čekání na síť, databázi či soubory, pokud je poskytují. CPU výpočet zůstává výpočtem: v UI může pomoci `Task.Run` pro odezvu, na serveru přesunutí do ThreadPoolu samo nepřidá výpočetní kapacitu.

## 4. Časté chyby

- `.Wait()` a `.Result` během čekání blokují; běžně použijte `await`.
- Volající nemůže awaitovat `async void` a obvykle kolem jeho volání nezachytí pozdější výjimku.
- Nečekaná ani jinak sledovaná úloha může skončit chybou bez odpovídající reakce.
- Token zrušení není násilné ukončení; předávejte jej podporovaným operacím.

Pokročilé vzory: [async/await](../H/Async_await_pokrocile.md), [asynchronní proudy](../H/IAsyncEnumerable.md).
