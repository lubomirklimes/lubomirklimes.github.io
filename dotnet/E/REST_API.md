# REST API v .NET – konvence, HttpClient a verzování

REST (Representational State Transfer) staví komunikaci kolem zdrojů a jednotného HTTP rozhraní. Pouhé použití JSON ještě nezajišťuje všechny REST vlastnosti. Zde jde o praktické HTTP konvence v ASP.NET Core 10 / C# 14; [Minimal API](MinimalAPI.md) vysvětluje mapování endpointů.

## 1. Princip :id=_1-koncept

### REST konvence

| Metoda | Typický význam |
|---|---|
| GET | Čtení bez změny aplikačního stavu |
| POST | Vytvoření zdroje nebo spuštění operace |
| PUT | Úplná náhrada známého zdroje |
| PATCH | Částečná změna podle dohodnutého formátu |
| DELETE | Odstranění zdroje |

Idempotentní operace má při opakování stejný zamýšlený účinek, nikoli nutně stejnou odpověď: druhý DELETE může vrátit 404 místo 204. GET má být bezpečný pro čtení; POST nelze po timeoutu obecně slepě opakovat. Pro opakované vytváření navrhněte vlastní idempotentní kontrakt.

### HTTP stavové kódy

| Kód | Význam v obvyklém API |
|---|---|
| 200 / 201 / 204 | Úspěšný výsledek / vytvoření / úspěch bez těla |
| 400 | Neplatný požadavek |
| 401 / 403 | Je nutné ověření identity / přístup není povolen |
| 404 / 409 | Zdroj chybí / konflikt s aktuálním stavem |
| 500 | Neočekávané selhání serveru |

Status vybírejte podle kontraktu operace: POST, který nic nevytváří, nemusí vracet 201. Hlavička `Location` sděluje adresu vytvořeného zdroje.

## 2. Příklad

### Minimal API pro zdroje :id=minimal-api-rest-endpoint

**Celý `Program.cs`** projektu `dotnet new web -n RestUkazka -f net10.0`. Úložiště v paměti je pouze demonstrace pro souběžné požadavky jednoho procesu. Spusťte `dotnet run --no-launch-profile --urls http://127.0.0.1:5080`.

```csharp
using System.Collections.Concurrent;
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddProblemDetails();
var app = builder.Build();
app.UseExceptionHandler();
app.UseStatusCodePages();
var data = new ConcurrentDictionary<int, Produkt>();
int dalsiId = 0;
app.MapGet("/api/produkty", () => data.Values.OrderBy(p => p.Id).ToArray());
app.MapGet("/api/produkty/{id:int}", (int id) =>
    data.TryGetValue(id, out var p) ? Results.Ok(p) : Results.NotFound())
    .WithName("GetProdukt");
app.MapPost("/api/produkty", (ProduktDto dto) =>
{
    if (string.IsNullOrWhiteSpace(dto.Nazev) || dto.Nazev.Length > 100 || dto.CenaKc < 1)
        return Results.ValidationProblem(new Dictionary<string, string[]>
        { ["produkt"] = ["Zadejte název do 100 znaků a kladnou cenu v Kč."] });
    var novy = new Produkt(Interlocked.Increment(ref dalsiId), dto.Nazev.Trim(), dto.CenaKc);
    data[novy.Id] = novy;
    return Results.CreatedAtRoute("GetProdukt", new { id = novy.Id }, novy);
});
app.MapDelete("/api/produkty/{id:int}", (int id) =>
    data.TryRemove(id, out _) ? Results.NoContent() : Results.NotFound());
app.Run();
public record Produkt(int Id, string Nazev, int CenaKc);
public record ProduktDto(string Nazev, int CenaKc);
```

Očekávané odpovědi: vytvoření (201), GET přes vrácené `Location` (200), odstranění (204) a opakované odstranění (404), neplatný vstup (400) i chybějící zdroj (404). Pojmenovaná GET trasa je nutná pro zdejší `CreatedAtRoute`.

`AddProblemDetails` registruje zápis standardizovaného chybového objektu (Problem Details, RFC 9457). Samo nezachytává chyby: výše jej využívají také exception handler a status code middleware. Chyba po zahájení těla odpovědi už nemusí jít přepsat. Veřejná odpověď nemá odhalovat zásobník a interní údaje.

### HttpClient s IHttpClientFactory :id=httpclient-s-ihttpclientfactory-klient

**Registrační fragment** před `Build()` ve webovém projektu nebo projektu s Generic Host. Adresa `example.test` je zástupná; nahraďte ji adresou skutečného API.

```csharp
builder.Services.AddHttpClient<ProduktApiKlient>(client =>
{
    client.BaseAddress = new Uri("https://example.test/");
    client.Timeout = TimeSpan.FromSeconds(10);
    client.DefaultRequestHeaders.Accept.ParseAdd("application/json");
});
```

**Soubor `ProduktApiKlient.cs`**; typ `Produkt` je stejný přenosový kontrakt jako výše.

```csharp
using System.Net.Http.Json;
public sealed class ProduktApiKlient(HttpClient http)
{
    public async Task<List<Produkt>> GetAllAsync(CancellationToken ct)
    {
        using var response = await http.GetAsync("api/produkty", ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<List<Produkt>>(cancellationToken: ct)
            ?? throw new InvalidDataException("API vrátilo null místo seznamu.");
    }
}
```

Nulová hodnota není automaticky prázdný seznam. Ošetření chyb a tokeny viz [síťová komunikace](../C/Networking.md). Potřebujete-li chybové Problem Details, načtěte je podle kontraktu ještě před vyvoláním vlastní výjimky; nevypisujte libovolné celé tělo do logu.

<span id="api-verzování"></span>

### Verzování API

Verzování určujte podle kompatibility kontraktu, ne podle každého nasazení. Prefix lze vymezit skupinou; následující alternativa pouze ukazuje dvě různé odpovědi, nepřidává se ke CRUD ukázce automaticky.

**Fragment** do webového `Program.cs` po `Build()`.

```csharp
app.MapGroup("/api/v1").MapGet("/stav", () => new { Stav = "Připraveno" });
app.MapGroup("/api/v2").MapGet("/stav", () => new { Stav = "Připraveno", Verze = 2 });
```

Pro složitější pravidla lze přidat příslušné balíčky rodiny `Asp.Versioning`; nejsou podmínkou obyčejného prefixu a samy neurčují kompatibilitu dat.

## 3. Kdy použít

Typovaný klient sdružuje konfiguraci a konkrétní API operace. `IHttpClientFactory` spravuje pool handlerů; vhodnou alternativou je dlouho žijící HttpClient s `SocketsHttpHandler.PooledConnectionLifetime`. Nepřidávejte nového klienta s novým handlerem pro každý jednotlivý požadavek.

## 4. Časté chyby

- `CreatedAtRoute` bez existujícího jména GET trasy selže při tvorbě odpovědi.
- Samotné `AddProblemDetails` nezajistí jednotný tvar všech ručně vytvořených chyb.
- Záměna neplatného JSON, neexistujícího zdroje a neočekávané serverové chyby vede k nesrozumitelným statusům.
- Zachycení typovaného klienta v singletonu může obejít zamýšlenou obnovu handlerů; řešte životnost klienta i změny DNS.
