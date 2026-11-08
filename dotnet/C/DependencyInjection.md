# Dependency Injection (DI) a práce se službami

Dependency Injection znamená dodávání závislostí objektu zvenku. Třída přijímá potřebnou službu místo toho, aby si sama vytvářela její konkrétní implementaci.

**Příklady:** .NET 10 / C# 14, webová aplikace ASP.NET Core (`dotnet new web -f net10.0`); další NuGet balíčky nejsou potřeba. Příklad používá controller, tedy třídu obsluhující HTTP požadavky; podrobně je vysvětluje kapitola [REST API](../E/REST_API.md).

## Proč DI?

Konstruktor vyjadřuje, co třída potřebuje. Rozhraní umožňuje zaměnit implementaci, například skutečné odesílání e-mailu za testovací službu. DI kontejner vytváří a propojuje objekty podle registrací; samotné rozhraní nezaručí správnou životnost ani bezpečnost při souběhu.

## Registrace služeb

| Registrace | Životnost instance | Typická omezení |
|---|---|---|
|`AddSingleton`|Jedna instance na kořenový kontejner|Sdílený měnitelný stav musí být bezpečný při souběhu.|
|`AddScoped`|Jedna instance na scope; ve webu obvykle HTTP požadavek|Mimo požadavek je nutné vytvořit vlastní scope.|
|`AddTransient`|Nová instance při každém vyžádání|Životnost zachycené instance závisí také na jejím příjemci.|

**Samostatný webový příklad:** vytvořte `dotnet new web -f net10.0`, nahraďte celý `Program.cs` následujícím blokem a spusťte `dotnet run --urls http://127.0.0.1:5091`.

```csharp
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
builder.Services.AddSingleton(new PotvrzeniNastaveni("Potvrzení objednávky"));
builder.Services.AddScoped<IObjednavkyRepo, ObjednavkyRepo>();
builder.Services.AddTransient<IEmailSluzba, KonzolovaEmailSluzba>();
var app = builder.Build();
app.MapControllers();
app.Run();

public record Objednavka(string Email);
public record PotvrzeniNastaveni(string Predmet);

public interface IObjednavkyRepo
{
    Task UlozAsync(Objednavka objednavka, CancellationToken ct);
}

public sealed class ObjednavkyRepo : IObjednavkyRepo
{
    private readonly List<Objednavka> _objednavky = [];
    public Task UlozAsync(Objednavka objednavka, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        _objednavky.Add(objednavka);
        return Task.CompletedTask;
    }
}

public interface IEmailSluzba
{
    Task OdeslatAsync(string adresat, string predmet, string telo, CancellationToken ct);
}

public sealed class KonzolovaEmailSluzba : IEmailSluzba
{
    public Task OdeslatAsync(string adresat, string predmet, string telo, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        Console.WriteLine($"Ukázka e-mailu pro {adresat}: {predmet} – {telo}");
        return Task.CompletedTask;
    }
}

[ApiController]
[Route("objednavky")]
public sealed class ObjednavkyController(
    IObjednavkyRepo repo, IEmailSluzba email, PotvrzeniNastaveni nastaveni) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Create(Objednavka objednavka, CancellationToken ct)
    {
        await repo.UlozAsync(objednavka, ct);
        await email.OdeslatAsync(objednavka.Email, nastaveni.Predmet, "Objednávka přijata.", ct);
        return Ok();
    }
}
```

Vyzkoušení z druhého terminálu (PowerShell):

```powershell
(Invoke-WebRequest -Uri http://127.0.0.1:5091/objednavky -Method Post -ContentType 'application/json' -Body '{"email":"ukazka@example.test"}').StatusCode
```

Stejný požadavek přes `curl` (Bash, macOS, Linux; ve Windows `curl.exe`):

```bash
curl -i -X POST http://127.0.0.1:5091/objednavky -H "Content-Type: application/json" -d '{"email":"ukazka@example.test"}'
```

Očekávaný stav je `200`; server vypíše ukázku e-mailu. Nic neposílá přes SMTP. Seznam objednávek žije jen v požadavku a pak zaniká: nejde o trvalé úložiště ani produkční objednávkový proces. Validace e-mailu a koordinace uložení s odesláním jsou zde vynechány.

## Získání služby (injekce konstruktorem)

Parametry primárního konstruktoru `ObjednavkyController` dostávají služby od ASP.NET Core. `ControllerBase` poskytuje metodu `Ok()`, proto ji lze volat jen uvnitř controlleru. `AddControllers` registruje podporu controllerů a `MapControllers` zpřístupní jejich atributové trasy.

## Rozhraní + implementace

`IEmailSluzba` určuje kontrakt `OdeslatAsync`; implementace i volající používají stejné jméno a podpis. Registrace přiřazuje rozhraní konkrétní třídě. Ukázková implementace vrací již dokončenou úlohu; asynchronní podpis vychází z kontraktu rozhraní, DI jej nevyžaduje.

<details>
<summary>Volitelné podrobnosti: Scope a nastavení</summary>

Singleton nesmí přímo zachytit scoped službu; tím by ji držel za hranicí požadavku. Služba na pozadí má pro příslušnou operaci vytvořit scope přes `IServiceScopeFactory` a v něm službu vyžádat. Zdroje vytvořené kontejnerem uvolňuje kontejner v odpovídajícím scope; běžně je neuvolňujte sami.

Přímé vyhledávání přes `GetRequiredService` skrývá závislosti, proto v aplikačních třídách preferujte konstruktor. Nastavení lze v reálném hostiteli načíst pomocí options vzoru (`Configure<T>` a `IOptions<T>`) místo pevného záznamu v ukázce; viz následující kapitola.

</details>
