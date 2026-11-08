# Minimal API :id=minimal-apis

Minimal API mapuje HTTP endpointy přímo na funkce. Endpoint je kombinace trasy, HTTP metody a obsluhy; controller není nutný. Příklad používá ASP.NET Core 10 / C# 14, ruční validaci a dočasné úložiště v paměti.

## Vytvoření projektu

Vytvořte `dotnet new web -n MojeApi -f net10.0`. Nahraďte `Program.cs` a přidejte soubor se službou níže. Spusťte `dotnet run --no-launch-profile --urls http://127.0.0.1:5080`. Pro základ není potřeba Swashbuckle ani jiný NuGet balíček.

## Základní API

**Soubor `Program.cs`**, spolu s `ProduktService.cs` níže. HTTP na loopbacku je pro lokální demonstraci; příklad neimplementuje přístupová práva ani trvalou databázi.

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<ProduktService>();
builder.Services.AddProblemDetails();
var app = builder.Build();
app.UseExceptionHandler();
app.UseStatusCodePages();
var produkty = app.MapGroup("/produkty").WithTags("Produkty");
produkty.MapGet("/", (ProduktService service) => service.Vsechny());
produkty.MapGet("/{id:int}", (int id, ProduktService service) =>
    service.Najdi(id) is { } p ? Results.Ok(p) : Results.NotFound())
    .WithName("GetProduktMinimal");
produkty.MapPost("/", (ProduktVstup input, ProduktService service) =>
{
    if (string.IsNullOrWhiteSpace(input.Nazev) || input.Nazev.Length > 100
        || input.CenaKc is < 1 or > 99999)
        return Results.ValidationProblem(new Dictionary<string, string[]>
        { ["produkt"] = ["Zadejte název do 100 znaků a cenu 1 až 99999 Kč."] });
    var novy = service.Pridej(input);
    return Results.CreatedAtRoute("GetProduktMinimal", new { id = novy.Id }, novy);
});
app.Run();
```

GET vrací seznam (200) nebo detail (200/404). Platný POST vytvoří produkt (201) a hlavičku `Location` na fungující detail; neplatná data vrátí 400. Chybně zapsaný JSON může být odmítnut bindingem ještě před spuštěním funkce.

<span id="s-di-a-službami"></span>

## DI a služby

DI je předávání registrovaných závislostí hostitelem. Parametr `ProduktService` pochází z DI, zatímco `ProduktVstup` z JSON těla. Singleton zde drží pouze paměťová data a používá souběžnou kolekci; databázový `DbContext` by takovou životnost mít neměl.

**Soubor `ProduktService.cs`**, včetně přenosových typů.

```csharp
using System.Collections.Concurrent;
public record Produkt(int Id, string Nazev, int CenaKc);
public record ProduktVstup(string Nazev, int CenaKc);
public sealed class ProduktService
{
    private readonly ConcurrentDictionary<int, Produkt> data = new();
    private int dalsiId;
    public Produkt[] Vsechny() => data.Values.OrderBy(p => p.Id).ToArray();
    public Produkt? Najdi(int id) => data.GetValueOrDefault(id);
    public Produkt Pridej(ProduktVstup input)
    {
        var p = new Produkt(Interlocked.Increment(ref dalsiId), input.Nazev.Trim(), input.CenaKc);
        data[p.Id] = p;
        return p;
    }
}
```

## Skupiny endpointů a validace

`MapGroup` sdílí prefix a metadata, nikoli automaticky všechna pravidla vstupu. Výše validujeme ručně před zápisem. Samotné DataAnnotations atributy bez zapojené validace nestačí; v .NET 10 lze využít vestavěnou validaci přes `AddValidation()` a potřebnou podporu projektu. Metoda `WithParameterValidation()` ze starších návodů pochází z externího balíčku MinimalApis.Extensions, ne ze samotného ASP.NET Core. [Validace v ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/validation/overview?view=aspnetcore-10.0).

## Autorizace

U chráněné skupiny přidejte `RequireAuthorization()` až s funkčním autentizačním schématem a `AddAuthorization`. Samotné `.AddJwtBearer()` bez důvěryhodného vydavatele a ověření tokenu není kompletní bezpečnostní konfigurace. Plný malý příklad politiky a rozdíl 401/403 viz [autentizace a autorizace](Auth.md).

<details>
<summary>Volitelné: OpenAPI a omezení četnosti</summary>

[OpenAPI](OpenAPI.md) potřebuje samostatný balíček a vystavení dokumentu; nespojujte alternativní bootstrapy do jednoho Program.cs.

**Alternativní celý `Program.cs`**, samostatně od produktové ukázky. Omezení četnosti (rate limiting) zde dovolí jeden požadavek za minutu pro celý endpoint v jednom procesu. Není to uživatelská kvóta ani distribuovaný limit.

```csharp
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddFixedWindowLimiter("ukazka", limit =>
    {
        limit.PermitLimit = 1;
        limit.Window = TimeSpan.FromMinutes(1);
        limit.QueueLimit = 0;
    });
});
var app = builder.Build();
app.UseRouting();
app.UseRateLimiter();
app.MapGet("/omezeno", () => "V pořádku.").RequireRateLimiting("ukazka");
app.Run();
```

První požadavek dostane 200, další ve stejném okně 429. Registrace politiky bez `UseRateLimiter()` ji nevynutí. Pro politiku závislou na uživateli musí autentizace předcházet vyhodnocení limitu; u endpointové politiky musí být již vybrána trasa.

</details>
