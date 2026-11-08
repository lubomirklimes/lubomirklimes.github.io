# ASP.NET Core MVC

MVC (Model–View–Controller) odděluje vstupní požadavek, aplikační data a HTML zobrazení. Controller vybírá odpověď, View je Razor šablona a model jí předává data. Příklad cílí na ASP.NET Core 10 / C# 14 a záměrně ukládá jen do paměti procesu.

## Vytvoření projektu

Vytvořte `dotnet new mvc -n MojeWebApp -f net10.0`. Následující soubory tvoří jednu ukázku; nahraďte `Program.cs` a přidejte uvedené modely, controller a Views. Spusťte `dotnet run --no-launch-profile --urls http://127.0.0.1:5080` a otevřete `/Produkt`. HTTP na loopbacku je pouze lokální demonstrace.

## Struktura projektu

Složky `Controllers`, `Views/Produkt` a `Models` mají v projektu odlišné role; `wwwroot` je veřejný statický obsah, ne místo pro tajná data. Pro stručnost jsou typy příkladu v globálním namespace.

**Celý `Program.cs`**; projekt tvoří spolu s ostatními soubory níže. V provozu doplňte HTTPS, autentizaci a oprávnění pro změny dat podle aplikace.

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllersWithViews();
builder.Services.AddSingleton<Sklad>();
var app = builder.Build();
app.MapControllerRoute("default", "{controller=Produkt}/{action=Index}/{id?}");
app.Run();
```

## Řadič požadavků (Controller) :id=controller

**Soubor `Controllers/ProduktController.cs`.** Vstupní model neobsahuje ID ani interní vlastnosti; klient je nemůže hromadným bindingem přepsat. Po úspěšném POST přesměrujeme na GET, aby obnovení stránky zbytečně neopakovalo změnu.

```csharp
using Microsoft.AspNetCore.Mvc;
public sealed class ProduktController(Sklad sklad) : Controller
{
    public IActionResult Index() => View(sklad.Vsechny());
    public IActionResult Detail(int id) => sklad.Najdi(id) is { } p ? Json(p) : NotFound();
    [HttpGet]
    public IActionResult Vytvor() => View(new ProduktVstup());
    [HttpPost, ValidateAntiForgeryToken]
    public IActionResult Vytvor(ProduktVstup input)
    {
        if (!ModelState.IsValid) return View(input);
        sklad.Pridej(input);
        return RedirectToAction(nameof(Index));
    }
}
```

CSRF je podvržený požadavek využívající údaje, které prohlížeč odesílá automaticky (například cookie). Antiforgery token ve formuláři musí odpovídat cookie; atribut jeho kontrolu vynucuje. Nenahrazuje přihlášení ani autorizaci.

## Zobrazení v Razor :id=view-razor

**Soubor `Views/Produkt/Index.cshtml`.** Tag Helpers propojují HTML atributy `asp-*` s routováním a formuláři.

```cshtml
@addTagHelper *, Microsoft.AspNetCore.Mvc.TagHelpers
@model IReadOnlyList<Produkt>
<h1>Produkty</h1>
<a asp-action="Vytvor">Přidat produkt</a>
<ul>
@foreach (var p in Model)
{
    <li><a asp-action="Detail" asp-route-id="@p.Id">@p.Nazev</a> – @p.CenaKc Kč</li>
}
</ul>
```

**Soubor `Views/Produkt/Vytvor.cshtml`.** POST Form Tag Helper generuje skrytý antiforgery token; ruční formulář by jej musel doplnit například přes `@Html.AntiForgeryToken()`.

```cshtml
@addTagHelper *, Microsoft.AspNetCore.Mvc.TagHelpers
@model ProduktVstup
<h1>Nový produkt</h1>
<form asp-action="Vytvor" method="post">
    <div asp-validation-summary="All"></div>
    <label asp-for="Nazev">Název</label><input asp-for="Nazev"/>
    <label asp-for="CenaKc">Cena v celých Kč</label><input asp-for="CenaKc"/>
    <button type="submit">Uložit</button>
</form>
```

## Model a validace

**Soubor `Models/Produkt.cs`**, včetně jednoduchého úložiště. `ConcurrentDictionary` a `Interlocked` umožňují souběžné požadavky; neřeší trvalé uložení ani databázové transakce.

```csharp
using System.Collections.Concurrent;
using System.ComponentModel.DataAnnotations;
public record Produkt(int Id, string Nazev, int CenaKc);
public sealed class ProduktVstup
{
    [Required(ErrorMessage = "Název je povinný."), StringLength(100)]
    public string Nazev { get; set; } = "";
    [Range(1, 99999, ErrorMessage = "Cena musí být 1 až 99999 Kč.")]
    public int CenaKc { get; set; }
}
public sealed class Sklad
{
    private readonly ConcurrentDictionary<int, Produkt> data = new();
    private int dalsiId;
    public IReadOnlyList<Produkt> Vsechny() => data.Values.OrderBy(p => p.Id).ToArray();
    public Produkt? Najdi(int id) => data.GetValueOrDefault(id);
    public Produkt Pridej(ProduktVstup input)
    {
        var produkt = new Produkt(Interlocked.Increment(ref dalsiId), input.Nazev.Trim(), input.CenaKc);
        data[produkt.Id] = produkt;
        return produkt;
    }
}
```

Validace na serveru proběhne i bez JavaScriptu. Chybné hodnoty znovu zobrazí formulář s chybami; chybějící token vrací 400, úspěšný POST přesměrování a následný seznam. Úložiště předpokládá již validovaný vstup controlleru; při použití odjinud kontrolujte pravidla i na aplikační hranici.

## Směrování požadavků :id=routing

Konvenční trasa výše mapuje `/Produkt/Detail/5` na `Detail(5)`. Chybějící produkt vrátí 404. Pro samostatné JSON API lze použít atributy `[ApiController]`, `[Route]` a `ControllerBase`; dva controllery se stejnými trasami by vedly k nejednoznačné shodě. Viz [REST API](REST_API.md).

<details>
<summary>Volitelné: middleware, filtry a oblasti</summary>

Middleware obaluje další zpracování HTTP, filtry MVC se uplatňují kolem akcí a zobrazení. Pravidla oprávnění předávejte autorizačnímu systému místo vlastní improvizované kontroly hlavičky. Areas rozdělují rozsáhlejší MVC projekty do oblastí se společným směrováním. [Ochrana proti CSRF](https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0).

</details>
