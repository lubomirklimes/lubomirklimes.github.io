# Rozšiřující metody :id=extension-methods

**Příklady:** .NET 10 / C# 14, `dotnet new console -f net10.0`. Každý blok C# je samostatný `Program.cs` pro `dotnet run`, pokud není označen jiný kontext. Bloky nespojujte.

Rozšiřující metoda zpřístupní statickou operaci syntaxí volání na hodnotě bez změny původního typu. Nemá privilegovaný přístup k jeho soukromým členům.

## 1. Princip :id=_1-koncept

Tradiční zápis používá `this` u prvního parametru statické metody v negenerické statické třídě. C# 14 přidává také bloky `extension`; zde zůstává platný starší zápis.

```csharp
string? text = null;
Console.WriteLine(text.JePrazdnyNeboNull() ? "Prázdný text" : "Vyplněno");
Console.WriteLine(TextExtensions.JePrazdnyNeboNull("ahoj") ? "Prázdný text" : "Vyplněno");
public static class TextExtensions
{
    public static bool JePrazdnyNeboNull(this string? text) => string.IsNullOrEmpty(text);
}
```

Výstup: `Prázdný text`, `Vyplněno`. Volání přes tečku se přeloží na statické volání; null příjemce zde nevadí, protože jej metoda ošetří. U typu v jiném oboru názvů je nutné odpovídající `using`.

## 2. Příklad

<span id="extension-na-vlastní-typ"></span>

### Rozšíření vlastního typu

Řetězitelné (fluent) API vrací hodnoty použitelné pro další volání:

```csharp
Objednavka[] objednavky = [
    new(100m, false, new DateTime(2026, 1, 1)),
    new(200m, true, new DateTime(2026, 2, 1)),
    new(50m, false, new DateTime(2025, 1, 1))];
decimal dluh = objednavky.JenNezaplacene().ZaRok(2026).CelkovaCastka();
Console.WriteLine($"Dluh: {dluh}");
public record Objednavka(decimal Castka, bool Zaplacena, DateTime Datum);
public static class ObjednavkaExtensions
{
    public static IEnumerable<Objednavka> JenNezaplacene(this IEnumerable<Objednavka> data) => data.Where(o => !o.Zaplacena);
    public static IEnumerable<Objednavka> ZaRok(this IEnumerable<Objednavka> data, int rok) => data.Where(o => o.Datum.Year == rok);
    public static decimal CelkovaCastka(this IEnumerable<Objednavka> data) => data.Sum(o => o.Castka);
}
```

Výstup: `Dluh: 100`. Filtrace je odložená, `Sum` ji vyhodnotí; zdroj nesmí být null.

<span id="extension-na-rozhraní"></span>

### Rozšíření rozhraní

Následující blok je **samostatný `Program.cs`** konzolového projektu `dotnet new console -f net10.0` s balíčkem pro výpis logů do konzole:

```powershell
dotnet add package Microsoft.Extensions.Logging.Console
```

```csharp
using Microsoft.Extensions.Logging;
using var factory = LoggerFactory.Create(b => b.AddConsole().SetMinimumLevel(LogLevel.Debug));
ILogger logger = factory.CreateLogger("Ukázka");
logger.LogIfDebug("Kontrola rozšíření");
public static class UkazkoveLoggerExtensions
{
    public static void LogIfDebug(this ILogger logger, string message)
    {
        if (logger.IsEnabled(LogLevel.Debug)) logger.LogDebug("{Zprava}", message);
    }
}
```

Konzole obsahuje debug zprávu `Kontrola rozšíření`; formát prefixu závisí na provideru. Kontrola uvnitř metody nezabrání vyhodnocení argumentu před voláním: `DrahyVypocet()` v argumentu by už proběhl. Tento pomocník není obecná optimalizace oproti vestavěnému logging API.

### Rozšíření pro registraci služeb :id=extension-pro-builder-pattern

Také **samostatný `Program.cs`** konzolového projektu, tentokrát s obecným hostitelem (Generic Host) z balíčku `Microsoft.Extensions.Hosting` (`dotnet add package Microsoft.Extensions.Hosting`). Ukazuje sdružení registrací a options vzor pro nastavení:

```csharp
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
var builder = Host.CreateApplicationBuilder(args);
builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["Email:Odesilatel"] = "ukazka@example.test" });
builder.Services.AddMojeSluzby(builder.Configuration);
using var app = builder.Build();
using var scope = app.Services.CreateScope();
Console.WriteLine(scope.ServiceProvider.GetRequiredService<IEmailSluzba>().Odesilatel);
public interface IEmailSluzba { string Odesilatel { get; } }
public sealed class EmailOptions { public string Odesilatel { get; set; } = ""; }
public sealed class EmailSluzba(IOptions<EmailOptions> options) : IEmailSluzba
{
    public string Odesilatel => options.Value.Odesilatel;
}
public static class MojeRegistraceExtensions
{
    public static IServiceCollection AddMojeSluzby(this IServiceCollection services, IConfiguration config)
    {
        services.AddScoped<IEmailSluzba, EmailSluzba>();
        services.Configure<EmailOptions>(config.GetSection("Email"));
        return services;
    }
}
```

Výstup: `ukazka@example.test`; nic se neodesílá. Metoda rozšiřuje `IServiceCollection`, takže stejnou registraci lze použít i ve webové aplikaci (`builder.Services` u `WebApplication.CreateBuilder`). Životnosti řeší [DI](../C/DependencyInjection.md).

## 3. Kdy použít

Pro úzce zaměřené operace nad cizími typy, rozhraními a řetězitelnými rozhraními knihoven. Rozsáhlá doménová logika potřebuje jasné závislosti a testy; samotná syntaxe rozšíření její umístění nerozhoduje.

## 4. Časté chyby

Použitelný instanční člen má při běžném vyhledávání přednost. Stejné jméno samo nestačí: nehodí-li se podpis instanční metody, může být vybráno rozšíření. Rozšíření nepřepisuje virtuální chování typu. Dvě importovaná rozšíření mohou způsobit nejednoznačnost, ale ne každá shoda názvů je chyba — rozhodují kandidáti a pravidla přetížení. Při potřebě vyberte explicitní statické volání. Rozšíření na `object` zvažujte opatrně kvůli příliš široké nabídce.
