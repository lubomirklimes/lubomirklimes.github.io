# Autentizace a autorizace v ASP.NET Core

Autentizace ověřuje **identitu** volajícího, autorizace rozhoduje o jeho **oprávnění**. Claim je údaj o identitě vydaný důvěryhodným systémem; politika (policy) je pravidlo přístupu. Cíl: ASP.NET Core 10 / C# 14.

## 1. Princip :id=_1-koncept

Autentizační schéma určuje například ověření cookie či bearer tokenu. `HttpContext.User` pak nese identitu a claims. Požadavek na chráněný API endpoint bez ověření typicky vede k 401, ověřený uživatel bez oprávnění k 403; cookie web může místo toho přesměrovat na přihlášení. V .NET 10 známé API endpointy u cookie schématu standardně vracejí 401/403 ([změna chování API](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/api-endpoint-auth?view=aspnetcore-10.0)).

<span id="jwt-bearer-nejběžnější-pro-api"></span>

### JWT Bearer pro API

JWT (JSON Web Token) je formát tokenu; OAuth 2.0 a OpenID Connect řeší širší protokoly oprávnění a přihlášení. Hlavička má tvar `Authorization: Bearer <token>`. Podpis chrání integritu, nešifruje automaticky obsah. Server musí ověřit podpis, důvěryhodného vydavatele, příjemce a platnost. Načtení klíčů, revokace či další pravidla mohou vyžadovat síť nebo úložiště, takže ověření tokenu se ne vždy obejde bez dalšího dotazu.

## 2. Příklad

### Konfigurace JWT Bearer :id=jwt-bearer-konfigurace

**Fragment** před `builder.Build()` ve webovém projektu .NET 10. Přidejte balíček `Microsoft.AspNetCore.Authentication.JwtBearer` řady 10.0.x: `dotnet add package Microsoft.AspNetCore.Authentication.JwtBearer --version 10.0.*`. `Jwt:Authority` musí být skutečný důvěryhodný HTTPS poskytovatel metadat a klíčů, `Jwt:Audience` identifikátor tohoto API. Zástupná adresa není přihlašovací služba.

```csharp
using Microsoft.AspNetCore.Authentication.JwtBearer;
string authority = builder.Configuration["Jwt:Authority"]
    ?? throw new InvalidOperationException("Chybí Jwt:Authority.");
string audience = builder.Configuration["Jwt:Audience"]
    ?? throw new InvalidOperationException("Chybí Jwt:Audience.");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.Authority = authority;
        o.Audience = audience;
        o.RequireHttpsMetadata = true;
        o.MapInboundClaims = false;
    });
builder.Services.AddAuthorization();
```

Za `Build()` pak patří `UseAuthentication()` a `UseAuthorization()` před chráněné endpointy. U role autorizace zkontrolujte skutečné názvy role/name claims poskytovatele. Pouhá přítomnost hlavičky ani dekódování payloadu neověřují token.

<span id="generování-jwt-tokenu"></span>

### Vydávání tokenů

API obvykle tokeny **ověřuje**, zatímco je vydává identity provider po ověření uživatele nebo klienta. Vlastní generátor s neověřenou rolí z požadavku by umožnil zvýšení oprávnění. Pokud vlastní vydávání opravdu potřebujete, navrhněte bezpečné přihlášení, správu a rotaci klíčů, povolené claims, publikum, expiraci a odvolání. Symetrický klíč uložený v repozitáři tyto předpoklady nesplňuje. Tokeny a tajemství nelogujte.

### Autorizace – atributy a politiky :id=autorizace-atributy-a-policy

**Alternativní celý `Program.cs`**, projekt `dotnet new web -f net10.0`, bez JWT balíčku. Používá cookie schéma a ověřenou identitu, kterou v reálné aplikaci vydá přihlašovací vrstva. Pro lokální zkoušení obsahuje jen ve vývojovém prostředí koncový bod `/dev/prihlasit`, který vydá pevnou testovací identitu bez hesla.

```csharp
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using System.Globalization;
using System.Security.Claims;
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o =>
    {
        o.Cookie.HttpOnly = true;
        o.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        o.Events.OnRedirectToLogin = ctx =>
        {
            ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        };
        o.Events.OnRedirectToAccessDenied = ctx =>
        {
            ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        };
    });
builder.Services.AddAuthorization(o =>
{
    o.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
    o.AddPolicy("MinVek18", p => p.RequireAuthenticatedUser().RequireAssertion(ctx =>
        int.TryParse(ctx.User.FindFirst("vek")?.Value, NumberStyles.None,
            CultureInfo.InvariantCulture, out int vek) && vek >= 18));
});
var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/api/verejne", () => TypedResults.Ok("Veřejný obsah.")).AllowAnonymous();
app.MapGet("/api/obsah-18plus", () => TypedResults.Ok("Obsah pro dospělé."))
    .RequireAuthorization("MinVek18");
app.MapGet("/api/sprava", () => TypedResults.Ok("Správa."))
    .RequireAuthorization(p => p.RequireRole("Admin", "Manager"));
if (app.Environment.IsDevelopment())
{
    // Jen pro lokální zkoušení: vydá pevnou identitu bez ověření hesla.
    app.MapPost("/dev/prihlasit", async (HttpContext ctx) =>
    {
        var identita = new ClaimsIdentity(
            [new Claim(ClaimTypes.Name, "ukazka"), new Claim("vek", "18")],
            CookieAuthenticationDefaults.AuthenticationScheme);
        await ctx.SignInAsync(new ClaimsPrincipal(identita));
        return TypedResults.NoContent();
    }).AllowAnonymous();
}
app.Run();
```

Veřejná cesta je dostupná bez identity. Chráněná cesta vrací 401 bez cookie, 403 pro chybějící/nečíselný/nižší věk a 200 pro důvěryhodný claim `vek=18`. Údaj z query by stejnou důvěru neměl. Cookie má příznak `Secure`, proto aplikaci zkoušejte přes HTTPS (například výchozí `dotnet run` s vývojovým certifikátem): po `POST /dev/prihlasit` vrátí `/api/obsah-18plus` stav 200 a `/api/sprava` stav 403. Vývojový koncový bod mimo prostředí `Development` neexistuje a skutečné přihlášení nenahrazuje. `Admin` nebo `Manager` jsou zde alternativy povolené role.

Atribut `[Authorize]` patří například na controller nebo metodu. U Minimal API slouží `.RequireAuthorization()` a `.AllowAnonymous()`; atribut lze případně umístit i přímo na lambdu obsluhy (`[Authorize] () => ...`).

## 3. Kdy použít

Cookie je přirozená pro tradiční web, bearer token pro klienta s odpovídajícím tokenovým protokolem. Rozhoduje architektura a hrozby. Cookie operace měnící data potřebují také ochranu proti [CSRF](ASP_NET_MVC.md); CORS (Cross-Origin Resource Sharing, pravidla pro požadavky prohlížeče mezi různými originy) ani HTTPS ji samy nenahradí. Politiky umožňují sdílet pravidla bez opakování kontrol v obsluhách.

## 4. Časté chyby

- Autentizace bez odpovídající autorizace nezakazuje přístup k datům. U konkrétního zdroje kontrolujte také vlastnictví zdroje a příslušnost k organizaci.
- `int.Parse` nad claimem může proměnit neplatný údaj v chybu 500; výše neplatný údaj přístup zamítne.
- Refresh token není povinnou opravou libovolné expirace; jeho vydávání, uložení a rotace jsou samostatný citlivý protokol.
- Chybný název role může zamítnout legitimní přístup; sdílené konstanty pomohou udržet názvy konzistentní.
