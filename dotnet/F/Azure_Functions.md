<span id="azure-functions-a-serverless-vývoj"></span>

# Azure Functions a bezserverové funkce

Functions spouštějí kód při události, například HTTP požadavku nebo zprávě. „Serverless“ neznamená absenci serverů, provozních limitů ani nákladů; kapacitu a škálování určuje hostingový plán. Zde jde o **.NET 10 isolated worker**, tedy oddělený proces od Functions hostitele, nikoli starší in-process model.

## Vytvoření projektu

Použijte kompatibilní Azure Functions Core Tools v4 a aktuální isolated šablonu, například `func init MojeFunkce --worker-runtime dotnet-isolated --target-framework net10.0`. Šablony Functions nejsou součástí .NET SDK; dodávají je Core Tools. Výsledný projekt má vlastní `host.json`, balíček Worker, sestavovací SDK a rozšíření jednotlivých triggerů; verze slaďte podle [isolated průvodce](https://learn.microsoft.com/en-us/azure/azure-functions/dotnet-isolated-process-guide).

**Celý `Program.cs`** pro model `HttpRequestData` níže. Projekt potřebuje balíček `Microsoft.Azure.Functions.Worker`, rozšíření `Microsoft.Azure.Functions.Worker.Extensions.Http` a sestavovací SDK: aktuální dokumentace doporučuje projektové SDK `Azure.Functions.Sdk` (`<Project Sdk="Azure.Functions.Sdk/1.0.1">`), starší projekty používají balíček `Microsoft.Azure.Functions.Worker.Sdk`. Šablona z `func init` vše připraví. ASP.NET Core typy `HttpRequest`/`IActionResult` vyžadují navíc integraci s ASP.NET Core (`ConfigureFunctionsWebApplication`).

```csharp
using Microsoft.Extensions.Hosting;
var host = new HostBuilder().ConfigureFunctionsWorkerDefaults().Build();
await host.RunAsync();
```

Novější šablony zapisují totéž přes `FunctionsApplication.CreateBuilder(args)`; oba způsoby jsou platné.

<span id="http-trigger-nejběžnější-trigger"></span>

## HTTP trigger

**Soubor `PozdravFunction.cs`** ve stejném isolated projektu. Route má standardně také prefix `/api` podle host.json.

```csharp
using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
public sealed class PozdravFunction
{
    [Function("Pozdrav")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Function, "get", Route = "pozdrav/{jmeno}")] HttpRequestData req,
        string jmeno)
    {
        bool platne = !string.IsNullOrWhiteSpace(jmeno) && jmeno.Length <= 100;
        var response = req.CreateResponse(platne ? HttpStatusCode.OK : HttpStatusCode.BadRequest);
        await response.WriteStringAsync(platne ? $"Ahoj, {jmeno.Trim()}!" : "Neplatné jméno.");
        return response;
    }
}
```

Funkční klíč v `AuthorizationLevel.Function` není identita koncového uživatele ani jeho oprávnění k datům. Lokální Core Tools běžně klíče nevynucují stejně jako Azure. Pro skutečnou autentizaci zvolte odpovídající přihlašovací vrstvu.

<span id="timer-trigger-naplnované-spuštění"></span>

## Timer trigger – plánované spuštění

**Metoda** uvnitř třídy isolated funkce s balíčkem `Microsoft.Azure.Functions.Worker.Extensions.Timer` a importem `Microsoft.Azure.Functions.Worker`. `TimerInfo` poskytuje toto rozšíření.

```csharp
[Function("DenniReport")]
public Task Run([TimerTrigger("0 0 6 * * *")] TimerInfo timer, CancellationToken ct)
{
    ct.ThrowIfCancellationRequested();
    return Task.CompletedTask; // Místo pro vlastní idempotentní službu reportu.
}
```

NCRONTAB zde má šest polí: sekunda, minuta, hodina, den, měsíc, den týdne. Výchozí čas je UTC; změna časové zóny má omezení podle OS/plánu. Timer není zárukou dokončeného reportu právě v 06:00. Retry se nastavuje podle podporované politiky; nespoléhejte, že každé selhání všech triggerů automaticky proběhne znovu. [Timer dokumentace](https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-timer).

## Blob trigger – reakce na soubor :id=blob-trigger-reakce-na-soubor

**Metoda** ve třídě s balíčkem `Microsoft.Azure.Functions.Worker.Extensions.Storage.Blobs` a nakonfigurovaným připojením `AzureStorage`. Neprovádí plné zpracování obrázku; ukazuje omezené čtení streamu a token.

```csharp
[Function("ZpracujSoubor")]
public async Task Run([BlobTrigger("obrazky/{name}", Connection = "AzureStorage")] Stream blob,
    string name, CancellationToken ct)
{
    byte[] buffer = new byte[4096];
    int precteno = await blob.ReadAsync(buffer, ct);
    if (precteno == 0) throw new InvalidDataException("Prázdný soubor.");
}
```

Jeden ReadAsync nemusí načíst celý soubor. Reálná služba musí řešit limity velikosti, opakované doručení a škodlivá data. `Connection` je prefix nastavení připojení; lze podle rozšíření nastavit identitu, nemusí obsahovat doslovný connection string. Polling a event-based Blob triggery mají různé předpoklady.

## Typy triggerů

| Trigger | Zdroj spuštění |
|---|---|
| HTTP / Timer | Požadavek / plán |
| Blob / Storage Queue | Změna objektu / zpráva fronty |
| Service Bus | Zpráva s brokerovými pravidly potvrzení |
| Event Grid | Událost z podporovaného zdroje nebo vlastní aplikace |

Trigger funkci spouští, vstupní/výstupní binding propojuje data. Pravidla opakování a odkládání chybných zpráv nejsou mezi triggery shodná; změny v cílovém systému navrhujte idempotentně.

## Lokální vývoj a nasazení

Po konfiguraci spusťte `func start`. Lokální hostitel může potřebovat úložiště či Azurite; skutečná tajemství nedávejte do repozitáře s `local.settings.json`. V Azure ověřte podporu kombinace .NET, OS a plánu: **.NET 10 není podporován na Linux Consumption**, podle dokumentace zvolte například Flex Consumption. Timeouty a dostupnost triggerů se liší podle plánu, proto je ověřte v jeho dokumentaci.

<details>
<summary>Volitelné: Durable Functions a orchestrace</summary>

**Metoda orchestrátoru** isolated projektu s balíčkem `Microsoft.Azure.Functions.Worker.Extensions.DurableTask` a importem `Microsoft.DurableTask`. Předpokládá registrované aktivity `Krok1` a `Krok2`, které ukázka neimplementuje.

```csharp
[Function("Orchestrator")]
public async Task<string> RunOrchestrator([OrchestrationTrigger] TaskOrchestrationContext context)
{
    var krok1 = await context.CallActivityAsync<string>("Krok1", null);
    return await context.CallActivityAsync<string>("Krok2", krok1);
}
```

Orchestrátor se může přehrávat z historie: musí být deterministický, síťové I/O patří do aktivit a čas/náhodnost do podporovaných API kontextu. Aktivita může být spuštěna opakovaně; durable historie nezaručuje právě jeden externí účinek. Pro kratší práci není orchestrace automaticky nutná.

</details>
