# Blazor – webové aplikace v C#

Blazor skládá web z Razor komponent (`.razor`). V Blazor Web App může každá část používat jiný způsob vykreslení; samotný C# v komponentě ještě nezaručuje interaktivní tlačítka. Cíl ukázek: ASP.NET Core 10 / C# 14.

<span id="dva-režimy-blazor"></span>

## Režimy vykreslení Blazoru

| Režim Blazor Web App | Kde běží komponenta | Interakce |
|---|---|---|
| Statické SSR | Server vykreslí HTML | Bez Blazor obsluhy kliknutí |
| `InteractiveServer` | Server; změny UI přes SignalR spojení | Potřebuje připojení k serveru |
| `InteractiveWebAssembly` | Po načtení běží C# v prohlížeči | Vyžaduje klientský projekt a podporu hostitele |
| `InteractiveAuto` | Nejprve server, při dalších návštěvách může klient | Automaticky nepřesouvá již běžící komponentu |

SSR znamená vykreslení HTML na serveru. Interaktivní komponenty se standardně také předvykreslují; inicializace tak může proběhnout pro předvykreslení i novou interaktivní instanci. Nespouštějte při ní nevratný zápis. Starší články používají pracovní název „Blazor United“; dnes jde o Blazor Web App. Samostatný WebAssembly projekt nemá toto přepínání režimů. [Dokumentace render modes](https://learn.microsoft.com/en-us/aspnet/core/blazor/components/render-modes?view=aspnetcore-10.0).

## Vytvoření projektu

Vytvořte `dotnet new blazor -n MojeBlazorApp -f net10.0 --interactivity Server`. Následující komponenty patří do jeho `Components/Pages` (Pozdrav do `Components`). Výchozí hostitel registruje `AddRazorComponents().AddInteractiveServerComponents()` a mapuje `MapRazorComponents<App>().AddInteractiveServerRenderMode()`. Ponechte i jeho antiforgery middleware a skript `_framework/blazor.web.js`. Spuštění: `dotnet run`.

## Komponenta

**Soubor `Components/Pages/Pocitadlo.razor`.** Explicitní režim zajišťuje, že po navázání spojení funguje obsluha události.

```razor
@page "/pocitadlo"
@using static Microsoft.AspNetCore.Components.Web.RenderMode
@rendermode InteractiveServer
<h1>Počítadlo: @pocet</h1>
<button @onclick="Inkrementuj">Přidat 1</button>
@code {
    private int pocet;
    private void Inkrementuj() => pocet++;
}
```

## Parametry komponenty

**Soubor `Components/Pozdrav.razor`**; namespace určuje projekt. Parametr dodává rodič například značkou `<Pozdrav Jmeno="Petr" />`, pokud má importovaný namespace komponenty.

```razor
@using Microsoft.AspNetCore.Components
<p>Ahoj, @Jmeno!</p>
@code {
    [Parameter] public string Jmeno { get; set; } = "";
}
```

Změnu směrem k rodiči oznamujte přes `EventCallback<T>`, nikoli nekontrolovanou změnou parametru. Uživatelský stav v serverovém singletonu sdílejí všichni uživatelé procesu; scoped služba interaktivního serveru je typicky svázána s circuitem (spojením a stavem relace), ne s každým HTTP požadavkem.

<span id="volaíní-api-a-async"></span>

## Volání API a asynchronní životní cyklus

**Soubor `ProduktKlient.cs`.** Pro tento serverový příklad zaregistrujte před `Build()` typovaného klienta přes `builder.Services.AddHttpClient<ProduktKlient>(c => c.BaseAddress = new Uri("https://example.test/"))`. Adresa `example.test` je zástupná: nahraďte ji adresou skutečného API, jinak stránka zobrazí „API není dostupné.“

```csharp
using System.Net.Http.Json;
public sealed class ProduktKlient(HttpClient http)
{
    public async Task<List<Produkt>> NactiAsync(CancellationToken ct) =>
        await http.GetFromJsonAsync<List<Produkt>>("api/produkty", ct)
        ?? throw new InvalidDataException("API vrátilo null.");
}
public record Produkt(string Nazev, int CenaKc);
```

**Soubor `Components/Pages/Produkty.razor`**, s klientem a jeho registrací výše.

```razor
@page "/produkty"
@using static Microsoft.AspNetCore.Components.Web.RenderMode
@rendermode InteractiveServer
@implements IDisposable
@inject ProduktKlient Api
@if (chyba is not null) { <p>@chyba</p> }
else if (produkty is null) { <p>Načítám…</p> }
else
{
    @foreach (var p in produkty) { <p>@p.Nazev – @p.CenaKc Kč</p> }
}
@code {
    private readonly CancellationTokenSource zivotnost = new();
    private List<Produkt>? produkty;
    private string? chyba;
    protected override async Task OnInitializedAsync()
    {
        try { produkty = await Api.NactiAsync(zivotnost.Token); }
        catch (OperationCanceledException) when (zivotnost.IsCancellationRequested) { }
        catch (OperationCanceledException) { chyba = "Načtení překročilo časový limit."; }
        catch (HttpRequestException) { chyba = "API není dostupné."; }
        catch (System.Text.Json.JsonException) { chyba = "API vrátilo neplatný JSON."; }
        catch (InvalidDataException) { chyba = "API vrátilo prázdná data."; }
    }
    public void Dispose() { zivotnost.Cancel(); zivotnost.Dispose(); }
}
```

Při předvykreslení může načtení proběhnout dvakrát; zvažte uchování předvykresleného stavu nebo vypnutí prerender pro danou komponentu. Registrace služby musí existovat v místě vykonávání komponenty; klientský WebAssembly projekt potřebuje vlastní registraci a dostupné API. Serverový HttpClient automaticky nepřebírá přihlášení prohlížeče.

## Formuláře a validace

**Soubor `Components/Pages/Osoba.razor`.** Potvrzení pouze ověřuje vstup, nikam jej neukládá. Pokud data posíláte API, validujte je znovu na serveru.

```razor
@page "/osoba"
@using System.ComponentModel.DataAnnotations
@using Microsoft.AspNetCore.Components.Forms
@using static Microsoft.AspNetCore.Components.Web.RenderMode
@rendermode InteractiveServer
<EditForm Model="model" OnValidSubmit="Odeslat" FormName="osoba">
    <DataAnnotationsValidator/>
    <ValidationSummary/>
    <label>Jméno <InputText @bind-Value="model.Jmeno"/></label>
    <button type="submit">Ověřit</button>
</EditForm>
<p>@zprava</p>
@code {
    private readonly OsobaModel model = new();
    private string zprava = "";
    private void Odeslat() => zprava = "Vstup je platný.";
    public sealed class OsobaModel
    {
        [Required(ErrorMessage = "Zadejte jméno."), StringLength(100)]
        public string Jmeno { get; set; } = "";
    }
}
```

<details>
<summary>Volitelné: JavaScript a události</summary>

DOM ani JavaScript nelze volat během serverového předvykreslení. Interop umístěte do interaktivní obsluhy nebo `OnAfterRenderAsync`; tato metoda při prerender neběží. Získané JS moduly a další vlastněné prostředky uvolňujte.

**Fragment** `.razor` komponenty s interaktivním režimem; `IJSRuntime` poskytuje hostitel. Výsledek uvidíte v konzoli vývojářských nástrojů prohlížeče.

```razor
@using Microsoft.JSInterop
@inject IJSRuntime JS
<button @onclick="Pozdravit">Zapsat pozdrav do konzole</button>
@code {
    private async Task Pozdravit() => await JS.InvokeVoidAsync("console.log", "Ahoj z C#!");
}
```

</details>
