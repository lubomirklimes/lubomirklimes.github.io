# Middleware a pipeline v ASP.NET Core

Middleware je krok řetězce zpracování HTTP požadavku (pipeline). Může předat řízení dál, upravit odpověď nebo požadavek ukončit. Příklady cílí na ASP.NET Core 10 / C# 14 a samostatné projekty `dotnet new web -f net10.0`.

## 1. Princip :id=_1-koncept

Dříve registrovaný middleware obaluje pozdější. Kód před `await next(context)` běží směrem k endpointu, kód po něm při návratu. Nepředání dál se nazývá zkrácení zpracování (short-circuit). Po odeslání hlaviček již nelze spolehlivě měnit status a hlavičky.

## 2. Příklad

<span id="standardní-pořadí-v-aspnet-core"></span>

### Obvyklé pořadí v ASP.NET Core

**Fragment** již vytvořeného webového `app`, ne celý `Program.cs`. Předpokládá `AddProblemDetails`, controllery a platné autentizační/autorizační registrace. HTTPS endpoint nebo správně nastavená proxy jsou další samostatné předpoklady.

```csharp
app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
```

Handler zachytí pouze chyby dalších kroků, proto patří časně; není to univerzálně pevný seznam. Statické soubory před autorizací jsou veřejné. CORS, přeposlané hlavičky proxy a endpointové limity mají vlastní požadavky na pořadí. V moderním Minimal API může hostitel některé kroky vložit automaticky; explicitní pořadí použijte tam, kde na něm záleží.

<span id="vlastní-middleware-třída"></span>

### Vlastní middleware ve třídě

**Soubor `RequestTimingMiddleware.cs`**; registrace přes `app.UseMiddleware<RequestTimingMiddleware>()` před mapováním endpointů.

```csharp
using System.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
public sealed class RequestTimingMiddleware(RequestDelegate next, ILogger<RequestTimingMiddleware> log)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var sw = Stopwatch.StartNew();
        context.Response.OnCompleted(() =>
        {
            log.LogInformation("{Method} -> {Status} za {Ms} ms",
                context.Request.Method, context.Response.StatusCode, sw.ElapsedMilliseconds);
            return Task.CompletedTask;
        });
        await next(context);
    }
}
```

`OnCompleted` zaznamená dokončenou odpověď včetně finálního statusu. Při odpojení nebo přerušené odpovědi callback není absolutní záruka diagnostiky; neočekávané chyby loguje také vnější handler. `finally` kolem `next` je vhodné pro úklid, ale vnitřní middleware v něm může vidět status ještě před zpracováním výjimky vnějším handlerem. Celé cesty s osobními údaji ani tokeny zde nelogujeme.

<span id="inline-middleware-pomocí-usemaprun"></span>

### Inline kroky Use, Map a Run

**Celý `Program.cs`**, společně s třídou výše. Spuštění: `dotnet run --no-launch-profile --urls http://127.0.0.1:5080`.

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddProblemDetails();
var app = builder.Build();
app.UseExceptionHandler();
app.UseMiddleware<RequestTimingMiddleware>();
app.Use(async (context, next) =>
{
    context.Response.Headers["X-App-Version"] = "1.0";
    await next(context);
});
app.Map("/healthz", branch => branch.Run(ctx => ctx.Response.WriteAsync("V pořádku.")));
app.Run(async context =>
{
    context.Response.StatusCode = StatusCodes.Status404NotFound;
    await context.Response.WriteAsync("Zdroj nebyl nalezen.");
});
app.Run();
```

`/healthz` vrací 200, jiná cesta 404 a český text. `Map` zde větví pipeline podle prefixu cesty; nejde o totéž jako `MapGet` vybírající endpoint a HTTP metodu. Terminální `Run(RequestDelegate)` nepředává řízení dál, závěrečné `Run()` spustí hostitele.

<span id="short-circuit-přerušení-pipeline"></span>

### Zkrácení pipeline

**Alternativní celý `Program.cs`.** Kontrola je demonstrační přepínač údržby pro všechny volající; s ověřováním identity nesouvisí.

```csharp
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/uzavreno"))
    {
        context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        await context.Response.WriteAsync("Probíhá údržba.");
        return;
    }
    await next(context);
});
app.MapGet("/", () => "Aplikace odpovídá.");
app.Run();
```

Cesta `/uzavreno` vrátí 503, kořen `/` vrátí 200. Skutečné ověření klíče nebo tokenu patří do autentizačního handleru a oprávnění do autorizace.

## 3. Kdy použít

Middleware řeší průřezové chování: hlavičky, diagnostiku, kompresi nebo obsluhu chyb. Pravidla jedné akce bývají přehlednější v endpointovém filtru či MVC filtru; aplikační validace může zůstat v obsluze či službě.

## 4. Časté chyby

- Zapsat do těla text „404“ nestačí: bez nastavení `StatusCode` server odpoví stavem 200.
- Změna hlaviček po `next` může přijít pozdě; připravte je před předáním nebo přes `OnStarting`.
- Přítomnost `X-Api-Key` nepotvrzuje jeho hodnotu, identitu ani oprávnění.
- Blokující I/O brzdí vlákno obsluhy; používejte asynchronní API a předávejte token zrušení.
