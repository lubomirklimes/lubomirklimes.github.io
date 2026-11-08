# SignalR

ASP.NET Core SignalR umožňuje serveru i klientům vyvolávat pojmenované zprávy v reálném čase. Přednostně používá WebSockets; podle prostředí může využít i Server-Sent Events nebo dlouhé HTTP dotazování. Cíl: ASP.NET Core 10 / C# 14.

## 1. Princip :id=_1-koncept

Hub je krátce žijící objekt obsluhující volání klienta; neukládejte do jeho polí trvalý stav relace. Skupiny slouží k adresování připojení, samy nejsou autorizační hranicí. Přidání do skupiny musí vycházet z ověřených práv, nikoli z libovolného názvu poslaného klientem.

Příklad předpokládá, že přihlašovací systém vydal důvěryhodný claim `tenant` s GUID organizace. Oprávnění do této organizace tím uděluje server; klient si claim nemůže sám stanovit. Pro okamžité odvolání práv přidejte nové ověření oprávnění nebo ukončení příslušných spojení.

## 2. Příklad

V projektu `dotnet new web -n ChatUkazka -f net10.0` přidejte třídy a Program níže. SignalR server je ve sdíleném frameworku, nepotřebuje zvláštní serverový NuGet balíček. Spouštění na loopbacku slouží k lokálnímu zkoušení; produkce vyžaduje HTTPS a skutečnou přihlašovací vrstvu.

### Hub

**Soubor `ChatHub.cs`.** Klient nepředává název cílové organizace.

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
[Authorize]
public sealed class ChatHub : Hub
{
    public static string SkupinaProTenant(Guid tenant) => $"tenant:{tenant:N}";
    private string Skupina()
    {
        if (!Guid.TryParse(Context.User?.FindFirst("tenant")?.Value, out var tenant)
            || tenant == Guid.Empty)
            throw new HubException("Chybí oprávnění pro skupinu.");
        return SkupinaProTenant(tenant);
    }
    public Task PridejSeDoSkupiny() =>
        Groups.AddToGroupAsync(Context.ConnectionId, Skupina(), Context.ConnectionAborted);
    public Task OdesliZpravu(string zprava)
    {
        if (string.IsNullOrWhiteSpace(zprava) || zprava.Length > 500)
            throw new HubException("Zpráva musí mít 1 až 500 znaků.");
        return Clients.Group(Skupina()).SendAsync("PrijmiZpravu",
            Context.UserIdentifier ?? "Uživatel", zprava.Trim(), Context.ConnectionAborted);
    }
}
```

Po běžném odpojení server členství odstraní. Při novém připojení se klient znovu přihlásí do skupiny po ověření identity; nespoléhejte na uchování členství přes každý typ obnovy spojení.

### Registrace

**Celý `Program.cs`**; cookie schéma je alternativou k bearer konfiguraci z [Auth](Auth.md). Přihlašování sám nevytváří: identitu s claimem `tenant` musí vydat přihlašovací vrstva aplikace.

```csharp
using Microsoft.AspNetCore.Authentication.Cookies;
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSignalR();
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o =>
    {
        o.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        o.Events.OnRedirectToLogin = ctx =>
        {
            ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        };
    });
builder.Services.AddAuthorization();
var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
app.MapHub<ChatHub>("/hubs/chat").RequireAuthorization();
app.Run();
```

<span id="volání-klienta-ze-serveru-bez-připojení-klienta"></span>

### Volání z jiné serverové služby

**Soubor `OznameniService.cs`**, dostupný přes `IHubContext<ChatHub>`. `overenyTenant` musí pocházet z autorizačního rozhodnutí služby, nikoli přímo z neověřeného HTTP parametru.

```csharp
using Microsoft.AspNetCore.SignalR;
public sealed class OznameniService(IHubContext<ChatHub> hub)
{
    public Task RozesliAsync(Guid overenyTenant, string text, CancellationToken ct)
    {
        if (overenyTenant == Guid.Empty) throw new ArgumentException("Chybí organizace.");
        if (string.IsNullOrWhiteSpace(text) || text.Length > 500)
            throw new ArgumentException("Neplatná zpráva.");
        return hub.Clients.Group(ChatHub.SkupinaProTenant(overenyTenant))
            .SendAsync("PrijmiZpravu", "server", text, ct);
    }
}
```

Přímou instanci hubu nevytvářejte; její `Context` a `Clients` spravuje SignalR. Skupinová adresa nedokazuje, že byl příjemce právě teď autorizován.

### JavaScript klient

**Modulový skript** stránky stejného originu s již načtenou knihovnou `signalR`. Knihovnu poskytne balíček npm `@microsoft/signalr` řady 10.x (například jeho `dist/browser/signalr.min.js`), který je nutné obsloužit staticky a načíst před tímto skriptem.

```javascript
const connection = new signalR.HubConnectionBuilder()
    .withUrl("/hubs/chat")
    .withAutomaticReconnect()
    .build();
connection.on("PrijmiZpravu", (odesilatel, zprava) =>
    console.log(`${odesilatel}: ${zprava}`));
connection.onreconnected(async () => {
    try { await connection.invoke("PridejSeDoSkupiny"); }
    catch { console.error("Obnova členství se nezdařila."); }
});
try {
    await connection.start();
    await connection.invoke("PridejSeDoSkupiny");
    await connection.invoke("OdesliZpravu", "Ahoj!");
} catch {
    console.error("Připojení nebo odeslání se nezdařilo.");
}
```

`withAutomaticReconnect` neopakuje automaticky první neúspěšný `start`. Strategie opakování a případné zobrazení stavu jsou odpovědností klienta. Zprávy nevkládejte do HTML přes `innerHTML` bez bezpečného zpracování.

<span id="azure-signalr-service-škálování"></span>

### Azure SignalR Service pro škálování

**Alternativní registrace** před `Build()` s balíčkem `Microsoft.Azure.SignalR`. Vyžaduje existující prostředek Azure SignalR Service a jeho připojovací řetězec v konfiguraci; kód sám žádný prostředek nevytváří.

```csharp
string spojeni = builder.Configuration["Azure:SignalR:ConnectionString"]
    ?? throw new InvalidOperationException("Chybí konfigurace SignalR služby.");
builder.Services.AddSignalR().AddAzureSignalR(spojeni);
```

Použijte jmenný prostor a verzi podle dokumentace balíčku, tajné hodnoty držte mimo repozitář. Na vlastních více instancích se používá například Redis backplane (propojovací vrstva), ale řešte i směrování spojení a požadavky na sticky sessions podle transportu a topologie.

## 3. Kdy použít

SignalR se hodí pro průběžné aktualizace dashboardu, spolupráci a oznámení v otevřené aplikaci. Pro jednosměrný proud může stačit Server-Sent Events; běžné `IAsyncEnumerable<T>` serializované jako JSON není automaticky SSE protokol.

## 4. Časté chyby

- CORS (Cross-Origin Resource Sharing) omezuje některé požadavky prohlížeče mezi originy; jeho ochrany neplatí stejně pro WebSockets. Není náhradou autentizace ani kontroly povolených originů. Pro stejný origin zde CORS nepotřebujete.
- Neověřené členství ve skupině může zpřístupnit cizí data, i když hub vyžaduje přihlášení.
- SignalR není trvalá fronta zpráv. Pro doručení přes výpadky navrhněte trvalé uložení, potvrzení a opakování; `Channel<T>` v paměti procesu také není trvalý broker.
- Nepředpokládejte neomezené uchování zpráv a spojení při restartu nebo reconnectu. [Bezpečnost SignalR](https://learn.microsoft.com/en-us/aspnet/core/signalr/security?view=aspnetcore-10.0).
