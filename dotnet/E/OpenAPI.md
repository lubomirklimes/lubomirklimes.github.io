# OpenAPI a Swagger :id=openapi-swagger

OpenAPI popisuje HTTP API strojově čitelným dokumentem: cesty, parametry, odpovědi a datová schémata. Swagger UI a Scalar jsou nástroje pro zobrazení a zkoušení takového dokumentu; nejsou samotným standardem. Příklady cílí na ASP.NET Core 10 / C# 14.

## 1. Princip :id=_1-koncept

Podpora generování je v samostatném NuGet balíčku `Microsoft.AspNetCore.OpenApi`, který není součástí sdíleného frameworku ASP.NET Core. Šablona jej může přidat za vás. Dokument vychází z endpointových metadat a návratových typů; anotace neprovádějí validaci vstupů ani nevynucují deklarované oprávnění.

## 2. Příklad

<span id="aspnet-core-9-nativní-openapi"></span>

### ASP.NET Core 10 – generování OpenAPI

**Celý `Program.cs`** v projektu `dotnet new web -f net10.0` s balíčkem `Microsoft.AspNetCore.OpenApi` řady 10.0.x. Přidání: `dotnet add package Microsoft.AspNetCore.OpenApi --version 10.0.*` (řada balíčku odpovídá verzi .NET, na kterou projekt cílí).

```csharp
using Microsoft.AspNetCore.Http.HttpResults;
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddOpenApi();
var app = builder.Build();
if (app.Environment.IsDevelopment()) app.MapOpenApi();
app.MapGet("/produkty/{id:int}", Results<Ok<Produkt>, NotFound> (int id) =>
    id == 1 ? TypedResults.Ok(new Produkt(1, "Kniha")) : TypedResults.NotFound())
    .WithName("GetProdukt")
    .WithSummary("Načte produkt podle ID")
    .WithTags("Produkty");
app.Run();
public record Produkt(int Id, string Nazev);
```

Při `Development` je dokument na `/openapi/v1.json`. Obsahuje odpovědi 200 a 404 i schéma `Produkt`, odvozené z typovaného výsledku; `Produces<T>()` není pro každou takovou funkci nutné. Mimo Development se dokument v této ukázce nevystavuje, samotné API ano. Spusťte například `dotnet run` s odpovídajícím prostředím a adresou; nasazení prostředí konfigurujte vědomě.

### Swashbuckle jako alternativa :id=swashbuckle-aspnet-core-68

Swashbuckle je samostatná knihovna třetí strany s vlastním vydávacím cyklem; zvolte verzi, která podporuje .NET 10. Pro Minimal API vyžaduje také API explorer.

**Fragmenty** před a po `Build()` v projektu s balíčkem `Swashbuckle.AspNetCore` (`dotnet add package Swashbuckle.AspNetCore`). Jde o alternativu k `AddOpenApi`/`MapOpenApi` z předchozí ukázky, ne o její doplněk.

```csharp
// Před Build():
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
// Po Build(), například uvnitř IsDevelopment():
app.UseSwagger();
app.UseSwaggerUI();
```

Zahrnutí XML komentářů navíc vyžaduje generovaný XML soubor (`GenerateDocumentationFile`) a jeho skutečnou cestu; název souboru odvoďte z názvu sestavení, ne z pevně zapsaného řetězce.

### Metadata pro controllery :id=atributy-pro-controllers

**Soubor `ProduktyController.cs`** pro projekt s `AddControllers()` a `MapControllers()`. Atribut popisuje odpovědi, tělo akce je skutečně vrací.

```csharp
using Microsoft.AspNetCore.Mvc;
[ApiController, Route("api/produkty")]
public sealed class ProduktyController : ControllerBase
{
    [HttpGet("{id:int}")]
    [ProducesResponseType<Produkt>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult<Produkt> Get(int id) =>
        id == 1 ? Ok(new Produkt(1, "Kniha")) : NotFound();
}
```

Typ `Produkt` je z úplné ukázky výše. Pro vlastní projekt držte kontrakt na jednom místě.

## 3. Kdy použít

Dokument pomáhá klientům, testům a dohodě o kontraktu. Udržujte jej spolu se skutečným chováním a zkontrolujte generované odpovědi. Scalar vyžaduje navíc balíček `Scalar.AspNetCore`, `using Scalar.AspNetCore;` a `app.MapScalarApiReference()` při existujícím OpenAPI endpointu; bez balíčku tato metoda neexistuje a projekt se nepřeloží. [Dokumentace generování](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/openapi/overview?view=aspnetcore-10.0).

## 4. Časté chyby

- Generování dokumentu a jeho vystavení jsou dva kroky: `AddOpenApi` a `MapOpenApi`.
- Explicitní názvy operací (`WithName`) musí být v dokumentu unikátní.
- Pouhé skrytí UI nezajišťuje autentizaci API. Vystavení dokumentace rozhodněte podle publika, citlivosti a přístupových práv.
- Metadata `Produces` neovlivní skutečně vrácený status ani neodhalí všechny možné chyby aplikace.
