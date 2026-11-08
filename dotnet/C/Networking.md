# Základy práce se sítí

**Příklady:** .NET 10 / C# 14. Samostatné bloky C# jsou jednotlivé náhrady `Program.cs` v projektu `dotnet new console -f net10.0`, spouštěné přes `dotnet run`. Bloky nespojujte; fragmenty a ukázky s dalšími požadavky jsou označené.

`HttpClient` odesílá HTTP požadavky. Vlastní síťová spojení spravuje handler; jejich opakované vytváření pro každý požadavek může vyčerpat prostředky.

## HTTP požadavky s `HttpClient`

**Samostatná konzolová ukázka bez internetu:** vlastní handler `UkazkovyHandler` vrací pevné odpovědi místo síťového spojení, takže příklad funguje offline. V jednom programu sdílíme klienta pro více požadavků a na konci jej uvolníme.

```csharp
using System.Net;
using System.Net.Http.Json;
using var client = new HttpClient(new UkazkovyHandler())
{
    BaseAddress = new Uri("https://example.test/"),
    Timeout = TimeSpan.FromSeconds(5)
};
using var limit = new CancellationTokenSource(TimeSpan.FromSeconds(2));
Console.WriteLine(await client.GetStringAsync("data", limit.Token));
var produkt = await client.GetFromJsonAsync<Produkt>("products/1", limit.Token)
    ?? throw new InvalidDataException("Prázdný produkt.");
if (string.IsNullOrWhiteSpace(produkt.Nazev) || produkt.Cena < 0)
    throw new InvalidDataException("Neplatný produkt.");
Console.WriteLine(produkt.Nazev);
using var response = await client.PostAsJsonAsync("products", produkt, limit.Token);
response.EnsureSuccessStatusCode();
Console.WriteLine((int)response.StatusCode);
public record Produkt(string Nazev, decimal Cena);
public sealed class UkazkovyHandler : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var response = new HttpResponseMessage(request.Method == HttpMethod.Post
            ? HttpStatusCode.Created : HttpStatusCode.OK)
        {
            Content = request.RequestUri?.AbsolutePath == "/data"
                ? new StringContent("Ukázková data.")
                : JsonContent.Create(new Produkt("Ukázka", 99m))
        };
        return Task.FromResult(response);
    }
}
```

Výstup: `Ukázková data.`, `Ukázka`, `201`. JSON převod nenahrazuje kontrolu aplikačních pravidel. `GetStringAsync` a `GetFromJsonAsync` odmítají neúspěšné HTTP stavy; u `PostAsJsonAsync` stav kontrolujeme výslovně. Odpověď vlastní volající a uvolňuje ji pomocí `using`.

V provozu používejte dlouho žijícího klienta s vhodným `SocketsHttpHandler.PooledConnectionLifetime`, nebo klienty z `IHttpClientFactory`. Továrna sdílí handlery; klienty z ní lze uvolňovat. Volba životnosti spojení závisí také na změnách DNS. Viz [doporučení pro HttpClient](https://learn.microsoft.com/en-us/dotnet/fundamentals/networking/http/httpclient-guidelines).

## Registrace `HttpClient` přes DI (doporučený přístup)

**Dva fragmenty webové aplikace** (`dotnet new web -f net10.0`). První patří do `Program.cs` před `builder.Build()`. Adresa `example.test` je zástupná; nahraďte ji adresou skutečného API.

```csharp
builder.Services.AddHttpClient<ProduktService>(client =>
{
    client.BaseAddress = new Uri("https://example.test/");
    client.Timeout = TimeSpan.FromSeconds(30);
});
```

Druhý je celý soubor `ProduktService.cs` v témže projektu. Typovaného klienta nezachycujte do singletonu na celou dobu běhu; tím obcházíte obnovování klientů továrnou.

```csharp
using System.Net.Http.Json;
public sealed class ProduktService(HttpClient client)
{
    public async Task<Produkt> GetProduktAsync(int id, CancellationToken ct)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(id);
        var produkt = await client.GetFromJsonAsync<Produkt>($"products/{id}", ct)
            ?? throw new InvalidDataException("Prázdný produkt.");
        if (string.IsNullOrWhiteSpace(produkt.Nazev) || produkt.Cena < 0)
            throw new InvalidDataException("Neplatný produkt.");
        return produkt;
    }
}
public record Produkt(string Nazev, decimal Cena);
```

## Ošetření chyb

**Fragment** do asynchronní metody s `HttpClient client` a tokenem volajícího `CancellationToken ct`. Rozlišuje tři situace: chybový HTTP stav (například 404), zrušení volajícím a vypršení časového limitu klienta.

```csharp
try
{
    Console.WriteLine(await client.GetStringAsync("data", ct));
}
catch (OperationCanceledException) when (ct.IsCancellationRequested)
{
    Console.WriteLine("Operace byla zrušena volajícím.");
}
catch (OperationCanceledException)
{
    Console.WriteLine("Operace překročila časový limit nebo byla jinak zrušena.");
}
catch (HttpRequestException ex)
{
    Console.WriteLine(ex.StatusCode is { } status
        ? $"HTTP chyba: {(int)status}" : "Spojení se nezdařilo.");
}
```

`TaskCanceledException` dědí z `OperationCanceledException`; samotný typ neprokazuje timeout. Při souběhu zrušení nelze vždy určit jedinou příčinu. Neopakujte automaticky libovolný POST: mohl být na serveru proveden i při ztracené odpovědi. Chybu JSON (`JsonException`) řešte odděleně podle hranice aplikace.

<details>
<summary>Volitelné: WebSockets a gRPC</summary>

**Fragment** do asynchronní metody s tokenem `ct`; potřebuje skutečný WebSocket server. Nejde o kompletní komunikační protokol; ten musí řešit příjem, části zpráv a korektní uzavření spojení.

```csharp
using var ws = new System.Net.WebSockets.ClientWebSocket();
await ws.ConnectAsync(new Uri("wss://example.test/ws"), ct);
```

WebSocket umožňuje obousměrnou komunikaci v jednom spojení. [gRPC](https://grpc.io/docs/) přidává typované kontrakty a generované klienty; volba mezi nimi závisí na požadavcích systému.

</details>
