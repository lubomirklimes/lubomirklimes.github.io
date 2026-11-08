# Konfigurace aplikace v .NET

**Příklady:** .NET 10 / C# 14. Samostatné bloky C# jsou jednotlivé náhrady `Program.cs` v projektu `dotnet new console -f net10.0`; potřebné NuGet balíčky uvádí každá ukázka. Webová aplikace (`dotnet new web`) je má k dispozici bez instalace. Bloky nespojujte; fragmenty jsou označené.

`IConfiguration` skládá klíče a hodnoty z více zdrojů (poskytovatelů) do jednoho stromu. Sekce odděluje dvojtečka, například `Email:Port`. Později přidaný zdroj přepisuje stejný klíč dřívějšího zdroje; nesouvisející klíče zůstávají.

## 1. Princip :id=_1-koncept

### Hierarchie zdrojů (výchozí pořadí v ASP.NET Core)

Pro běžnou aplikační konfiguraci `WebApplication.CreateBuilder(args)` roste priorita takto:

1. `appsettings.json`.
2. `appsettings.{Environment}.json`.
3. User Secrets ve vývojovém prostředí `Development`, je-li projekt podporuje.
4. Proměnné prostředí.
5. Argumenty příkazové řádky.

Jde o aplikační hodnoty; hostitel má také časně načítané nastavení (například prostředí). Vlastní poskytovatel nebo změna pořadí může výchozí prioritu změnit. [Podrobnosti konfigurace](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/configuration/?view=aspnetcore-10.0).

### Typované nastavení :id=options-pattern

Options pattern váže sekci na třídu a umožňuje její validaci.

| Rozhraní | Životnost | Chování při změně |
|---|---|---|
| `IOptions<T>` | Singleton | Hodnota se vytvoří a uloží při prvním přístupu; změny neobnovuje |
| `IOptionsSnapshot<T>` | Scoped | V rámci scope má uloženou hodnotu; nový scope ji může vytvořit z nových dat |
| `IOptionsMonitor<T>` | Singleton | Poskytuje aktuální hodnotu a oznámení, pokud poskytovatel ohlásí změnu |

Obnova závisí na poskytovateli a jeho oznámeních. Změna proměnné prostředí sama nevyvolá průběžné načtení. Snapshot není vhodný k přímému vložení do singletonu. Validace běží při vytváření hodnot; `ValidateOnStart` ji navíc vynutí při startu hostitele.

## 2. Příklad

### appsettings.json

**Obsah souboru** `appsettings.json` v kořeni webového projektu, ne samostatný program. Následující spustitelné ukázky používají hodnoty v paměti, aby nezávisely na souboru.

```json
{
  "Databaze": {
    "ConnectionString": "Server=localhost;Database=Moje",
    "MaxConnections": 20
  },
  "Email": { "Server": "smtp.example.test", "Port": 587 }
}
```

Ukázka neobsahuje přihlašovací údaje a nenavazuje spojení.

### Čtení přes IConfiguration přímo

Ukázka potřebuje balíčky `Microsoft.Extensions.Configuration` (zdroje a `ConfigurationBuilder`) a `Microsoft.Extensions.Configuration.Binder` (metoda `GetValue`), oba přes `dotnet add package`. Skládá dva zdroje s explicitní prioritou. Chybějící klíč indexeru vrací `null`; typový převod může selhat, výchozí hodnota neřeší chybný text čísla.

```csharp
using Microsoft.Extensions.Configuration;
var config = new ConfigurationBuilder()
    .AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["Databaze:MaxConnections"] = "20"
    })
    .AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["Databaze:MaxConnections"] = "50"
    }).Build();
Console.WriteLine(config.GetValue<int>("Databaze:MaxConnections", 10));
Console.WriteLine(config.GetValue<int>("Chybi", 10));
```

Výstup: `50` a `10`. Přímé čtení je vhodné například na hranici konfigurace hostitele nebo pro jednoduchou hodnotu; není samo o sobě chybou.

<span id="options-pattern-typovaná-konfigurace"></span>

### Typovaná konfigurace s validací

**Samostatný Generic Host** bez HTTP a SMTP. Potřebuje balíčky `Microsoft.Extensions.Hosting` a `Microsoft.Extensions.Options.DataAnnotations` (oba přes `dotnet add package`). Zdroje konfigurace vymažeme, aby výsledek nezávisel na okolí. V reálné aplikaci ponechte potřebné zdroje a čtěte sekci z nich.

```csharp
using System.ComponentModel.DataAnnotations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
var builder = Host.CreateApplicationBuilder(args);
builder.Logging.ClearProviders();
builder.Configuration.Sources.Clear();
builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
{
    ["Email:Server"] = "smtp.example.test", ["Email:Port"] = "587"
});
builder.Services.AddOptions<EmailOptions>().BindConfiguration("Email")
    .ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddTransient<EmailSluzba>();
using var host = builder.Build();
await host.StartAsync();
await host.Services.GetRequiredService<EmailSluzba>().OdesliAsync();
await host.StopAsync();
public sealed class EmailOptions
{
    [Required] public string Server { get; set; } = "";
    [Range(1, 65535)] public int Port { get; set; }
}
public sealed class EmailSluzba(IOptions<EmailOptions> options)
{
    public Task OdesliAsync()
    {
        Console.WriteLine($"Ukázkový port: {options.Value.Port}; nic se neodesílá.");
        return Task.CompletedTask;
    }
}
```

Výstup: `Ukázkový port: 587; nic se neodesílá.`. Při `Port = 0` start skončí výjimkou `OptionsValidationException`. Přítomnost atributů bez `ValidateDataAnnotations` by tuto validaci nezapnula. Formální validita serveru nedokazuje dostupnost SMTP.

### Proměnné prostředí a Docker

**Příkazy pro Bash** před spuštěním aplikace. Dvojité podtržítko se převádí na dvojtečku. Uvozovky chrání středník před shellem.

```bash
export Databaze__ConnectionString='Server=proddb;Database=Moje'
export Databaze__MaxConnections=50
```

**Fragment** `environment` uvnitř služby existujícího Compose souboru. Obraz ani infrastrukturu tato ukázka nevytváří.

```yaml
environment:
  Databaze__ConnectionString: 'Server=db;Database=Moje'
  ASPNETCORE_ENVIRONMENT: Production
```

## 3. Kdy použít

Typované options se hodí pro související hodnoty a jasně vymezené závislosti služeb. Důležité hodnoty validujte při startu. `IOptionsMonitor<T>` zvolte, když má služba skutečně reagovat na obnovu; hodnotu pak nezachyťte jednou do neměnného pole a neočekávejte její aktualizaci.

Pro lokální tajné údaje lze použít User Secrets (nejsou šifrovaným trezorem); v provozu zvolte spravovaný zdroj tajemství podle prostředí. Hodnoty připojení ani klíče nevypisujte do logu. Viz [dokumentace options](https://learn.microsoft.com/en-us/dotnet/core/extensions/options).

## 4. Časté chyby

- Zaměňovat výchozí hodnotu s validací rozsahu či formátu.
- Očekávat kontrolu při startu bez `ValidateOnStart` a skutečného spuštění hostitele.
- Předpokládat okamžitou obnovu u každého poskytovatele nebo u `IOptions<T>`.
- Uložit tajné hodnoty do repozitáře; pozdější smazání neodstraní historii.
