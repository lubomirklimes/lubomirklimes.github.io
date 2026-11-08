# Služby na pozadí a hostované služby :id=background-services-a-hosted-services

**Příklady:** .NET 10 / C# 14. Samostatná ukázka je `Program.cs` konzolového projektu `dotnet new console -f net10.0` s balíčkem `Microsoft.Extensions.Hosting` (`dotnet add package Microsoft.Extensions.Hosting`). Šablona `dotnet new worker` tento balíček obsahuje předem. Bloky nespojujte; fragmenty jsou označené.

`IHostedService` a `BackgroundService` spravuje Generic Host. Hodí se pro fronty, inicializaci a jednoduché opakované úlohy. Samotný proces nezaručuje trvalé uchování úloh, spuštění při výpadku ani právě jedno provedení v několika replikách.

## 1. Princip :id=_1-koncept

`IHostedService.StartAsync` se účastní startu hostitele, `StopAsync` jeho řízeného ukončení. Start jednotlivých služeb je výchozím nastavením sekvenční; volby hostitele mohou souběžnost změnit. Dlouhý start proto oddaluje připravenost aplikace.

`BackgroundService` implementuje životní cyklus a poskytuje `ExecuteAsync(ct)` pro práci na pozadí. **Od .NET 10 běží celá metoda na úloze na pozadí**, včetně části před prvním `await`; nelze ji použít jako implicitní startovací bariéru. Nezbytnou inicializaci dokončete v `StartAsync` nebo jiném explicitním kroku. Viz [změna v .NET 10](https://learn.microsoft.com/en-us/dotnet/core/compatibility/extensions/10.0/backgroundservice-executeasync-task).

| Typ | Typické použití |
|---|---|
| `IHostedService` | Explicitní inicializace a ukončení |
| `BackgroundService` | Asynchronní odběr fronty, opakovaná práce |

## 2. Příklad

<span id="backgroundservice-worker-smyčka"></span>

### BackgroundService – zpracování fronty

**Samostatný Generic Host** s konečnou frontou v paměti. Worker je služba odebírající práci; zde je singleton. Scope je oblast životnosti [DI služeb](DependencyInjection.md). Pro každé čtení vytvoří nový scope a uvolní jeho asynchronně uvolnitelnou službu i při ukončení. Ukázka nepotřebuje broker ani databázi.

```csharp
using System.Threading.Channels;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
var fronta = Channel.CreateUnbounded<string>();
fronta.Writer.TryWrite("první");
fronta.Writer.TryWrite("druhá");
fronta.Writer.Complete();
var builder = Host.CreateApplicationBuilder(args);
builder.Logging.ClearProviders();
builder.Services.AddSingleton(fronta.Reader);
builder.Services.AddScoped<IFrontaSluzba, FrontaSluzba>();
builder.Services.AddHostedService<FrontaWorker>();
using var host = builder.Build();
await host.RunAsync();
public sealed class FrontaWorker(IServiceScopeFactory scopeFactory,
    IHostApplicationLifetime lifetime) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        try
        {
            while (!ct.IsCancellationRequested)
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var sluzba = scope.ServiceProvider.GetRequiredService<IFrontaSluzba>();
                string? zprava = await sluzba.PrectiAsync(ct);
                if (zprava is null) { lifetime.StopApplication(); return; }
                Console.WriteLine($"Zpracováno: {zprava}");
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
    }
}
public interface IFrontaSluzba
{
    Task<string?> PrectiAsync(CancellationToken ct);
}
public sealed class FrontaSluzba(ChannelReader<string> reader) : IFrontaSluzba, IAsyncDisposable
{
    public async Task<string?> PrectiAsync(CancellationToken ct)
    {
        while (await reader.WaitToReadAsync(ct))
            if (reader.TryRead(out var zprava)) return zprava;
        return null;
    }
    public ValueTask DisposeAsync()
    {
        Console.WriteLine("Služba uvolněna.");
        return ValueTask.CompletedTask;
    }
}
```

Výstup obsahuje `Zpracováno: první`, uvolnění služby, `Zpracováno: druhá`, uvolnění služby a poslední uvolnění při zjištění konce fronty. Nejde o potvrzování zpráv ani mechanismus opakování. U skutečné fronty řešte potvrzení a opakování podle jejího protokolu.

### IHostedService – jednorázová inicializace

**Fragment:** typ do existujícího hostitele s registrovaným `AppDbContext`, relačním poskytovatelem EF Core a migracemi (balíček `Microsoft.EntityFrameworkCore` a balíček poskytovatele). Databázi ani migrace ukázka sama nevytváří. Importujte také jmenné prostory DI a hostitele jako výše.

```csharp
using Microsoft.EntityFrameworkCore;
public sealed class DatabaseMigrator(IServiceScopeFactory scopeFactory) : IHostedService
{
    public async Task StartAsync(CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.MigrateAsync(ct);
    }
    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;
}
```

Chyba migrace má zde zastavit start. U více replik zvažte samostatný řízený migrační krok; automatický start každé repliky neřeší koordinaci ani provozní oprávnění.

### Registrace v Program.cs

První úplný příklad již obsahuje `AddHostedService<FrontaWorker>()`. Pro migrační variantu přidejte před `Build()` registraci `AddHostedService<DatabaseMigrator>()` i konkrétní `DbContext`. Pořadí registrace má význam při výchozím sekvenčním startu. Inicializaci nutnou před workerem registrujte před ním; při souběžném startu potřebujete explicitní koordinaci.

Pro samostatnou službu bez HTTP je určena šablona `dotnet new worker -f net10.0`; ve webové aplikaci se hostované služby registrují stejně přes `builder.Services`.

<span id="pravidelné-spouštění-scheduler"></span>

### Pravidelné spouštění

**Fragment:** typy do hostitele s `AddHostedService<DenníReport>()` a scoped implementací `IReportSluzba`, kterou dodá aplikace. Importujte DI a hostitele jako v první ukázce. Výpočet `DalsiSpusteni` je čistá funkce, takže jej lze snadno otestovat na pevných datech.

```csharp
public sealed class DenníReport(IServiceScopeFactory scopeFactory) : BackgroundService
{
    public static DateTimeOffset DalsiSpusteni(DateTimeOffset ted)
    {
        var utc = ted.ToUniversalTime();
        var dnes = new DateTimeOffset(utc.Year, utc.Month, utc.Day, 6, 0, 0, TimeSpan.Zero);
        return dnes > utc ? dnes : dnes.AddDays(1);
    }
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        try
        {
            var ted = DateTimeOffset.UtcNow;
            await Task.Delay(DalsiSpusteni(ted) - ted, ct);
            using var timer = new PeriodicTimer(TimeSpan.FromHours(24));
            do
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var sluzba = scope.ServiceProvider.GetRequiredService<IReportSluzba>();
                await sluzba.VygenerujAsync(ct);
            } while (await timer.WaitForNextTickAsync(ct));
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
    }
}
public interface IReportSluzba
{
    Task VygenerujAsync(CancellationToken ct);
}
```

První report běží hned po počátečním čekání na nejbližší budoucí 06:00 **UTC**, další po tiknutí časovače. Při startu v 05:00 UTC tedy první report proběhne v 06:00 téhož dne a další o 24 hodin později. Běhy se nepřekrývají; `PeriodicTimer` může sloučit zmeškané tiky. Není to přesný kalendářní plánovač: změny systémového času, restarty a delší běhy mohou rozvrh ovlivnit. Pro 06:00 v místním pásmu je nutné řešit letní čas; pro trvalé plánování použijte odpovídající plánovač.

## 3. Kdy použít

Worker je vhodný pro práci během života procesu. Nezbytné předehřátí cache patří do explicitního startovacího kroku, pokud na něm závisí připravenost. Pro distribuované úlohy zvažte trvalou frontu, idempotentní zpracování a koordinaci replik.

## 4. Časté chyby

- Přímé vložení scoped služby do singleton workeru prodlouží její životnost nebo selže při kontrole scope. Vytvářejte scope pro jednotku práce.
- Nepředání tokenu do čekání či I/O oddaluje ukončení. Výchozí `HostOptions.ShutdownTimeout` v .NET 10 je **30 sekund**, lze jej změnit; po limitu není dokončení práce zaručeno. Násilné ukončení nemusí zavolat `StopAsync`.
- Nezachycená chyba `BackgroundService` se ve výchozím nastavení moderního hostitele zaloguje a zastaví hostitele (`StopHost`), ne pouze worker. Bezhlavé zachycení všech chyb může naopak skrýt trvalé selhání. Opakujte jen známé přechodné chyby s omezenou strategií.
- Zrušení jiným tokenem automaticky není běžný shutdown. Filtrujte očekávané zrušení vlastním tokenem.
- `Thread.Sleep` blokuje vlákno; pro asynchronní čekání použijte `Task.Delay(..., ct)`.
