# Razor Pages

Razor Pages je model ASP.NET Core pro HTML vykreslované na serveru. Stránku tvoří `.cshtml` šablona a doprovodný `PageModel` s obsluhou GET/POST. Cíl: .NET 10 / C# 14; navazuje na [MVC a validaci](ASP_NET_MVC.md).

## 1. Princip :id=_1-koncept

Direktiva `@page` přidává stránce HTTP trasu. `OnGet`/`OnPostAsync` jsou obsluhy podle metody požadavku, nikoli samostatné controllery. Binding převádí vstup na vlastnosti, validace ověřuje jeho pravidla; tyto dvě činnosti nezaměňujte.

## 2. Příklad

V projektu `dotnet new webapp -n MojeStranky -f net10.0` nahraďte `Program.cs` a přidejte níže uvedené soubory. Pro názornost jde o jediný formulář, který nic neukládá. Po validním zadání přesměruje na tentýž formulář s potvrzením. Spuštění: `dotnet run --no-launch-profile --urls http://127.0.0.1:5080`, cesta `/Products/Create`.

### PageModel – obsluha metod HTTP :id=pagemodel-handler-metody

**Soubor `Pages/Products/Create.cshtml.cs`.** Oddělený vstupní typ zabraňuje bindingu interních polí entity. Asynchronní varianta má smysl, až když skutečně čeká na I/O.

```csharp
using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
namespace MojeStranky.Pages.Products;
public sealed class CreateModel : PageModel
{
    [BindProperty] public ProduktVstup Input { get; set; } = new();
    [BindProperty(SupportsGet = true)] public bool Ulozeno { get; set; }
    public void OnGet() { }
    public IActionResult OnPost()
    {
        if (!ModelState.IsValid) return Page();
        return RedirectToPage("./Create", new { ulozeno = true });
    }
    public sealed class ProduktVstup
    {
        [Required(ErrorMessage = "Název je povinný."), StringLength(100)]
        public string Nazev { get; set; } = "";
        [Range(1, 99999, ErrorMessage = "Cena musí být 1 až 99999 Kč.")]
        public int CenaKc { get; set; }
    }
}
```

### Šablona (.cshtml)

**Soubor `Pages/Products/Create.cshtml`.** Razor Pages při POST standardně kontrolují antiforgery token; Form Tag Helper jej doplní. JavaScript není pro tuto serverovou validaci potřeba.

```cshtml
@page
@model MojeStranky.Pages.Products.CreateModel
@addTagHelper *, Microsoft.AspNetCore.Mvc.TagHelpers
<h1>Nový produkt</h1>
@if (Model.Ulozeno)
{
    <p>Vstup je platný; tato ukázka nic neukládá.</p>
}
<form method="post">
    <div asp-validation-summary="All"></div>
    <label asp-for="Input.Nazev">Název</label><input asp-for="Input.Nazev"/>
    <label asp-for="Input.CenaKc">Cena v celých Kč</label><input asp-for="Input.CenaKc"/>
    <button type="submit">Ověřit</button>
</form>
```

<span id="post-formulář-s-model-bindingem"></span>

### POST – formulář s vazbou vstupu

`OnPost` nejprve vyhodnotí `ModelState.IsValid`; při neúspěchu vrátí `Page()` se vstupem a chybami. Až po úspěchu volejte aplikační službu, například `await sluzba.CreateAsync(Input, ct)` v `OnPostAsync(CancellationToken ct)`. Taková služba vyžaduje vlastní implementaci a DI registraci; ukázka výše žádnou nepotřebuje.

Token chrání před CSRF (podvrženým požadavkem z jiného webu), nikoli před přístupem nepřihlášeného uživatele. Přidání autentizace a oprávnění je samostatný krok. Query parametr `Ulozeno` jen řídí zobrazení potvrzení; klient jej může nastavit sám, takže nic nedokazuje.

### Registrace v Program.cs

**Celý `Program.cs`** v témže projektu.

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddRazorPages();
var app = builder.Build();
app.MapRazorPages();
app.Run();
```

Očekávané odpovědi: GET vrací formulář (200); POST bez antiforgery tokenu 400; neplatná data s tokenem formulář s chybami (200); platná data přesměrování (302). Provozní HTTPS a řízení přístupu doplňte podle aplikace.

## 3. Kdy použít

Stránkový model je vhodný pro formuláře a správní rozhraní. Aplikační pravidla lze stejně jako v MVC testovat ve službách; není nutné přecházet na controllery jen kvůli testovatelnosti. Pro čisté datové API použijte odpovídající HTTP endpointy.

## 4. Časté chyby

- Chybějící `@page` změní soubor na Razor zobrazení bez vlastní page trasy.
- `[BindProperty]` bez `SupportsGet=true` neváže tuto vlastnost z GET; parametry handlerů se vážou samostatně. Výchozí atribut není omezen pouze na POST.
- Úspěšný převod typu není totéž co `ModelState.IsValid` ani doménová validace.
- Přesměrování po POST omezuje opakování při obnovení, ale samo nezajišťuje idempotentní zápis při dvojím odeslání.
