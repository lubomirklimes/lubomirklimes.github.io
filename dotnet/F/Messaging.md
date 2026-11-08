# Zprávy a fronty (Service Bus, RabbitMQ) :id=messaging-service-bus-rabbitmq

Asynchronní zprávy oddělují odesilatele od příjemce. Broker je prostředník ukládající a směrující zprávy. Doručení a vykonání účinku nejsou totéž: i po úspěšném zpracování může ztracené potvrzení způsobit nové doručení. C# ukázky předpokládají .NET 10; Azure SDK a MassTransit mají vlastní verze.

## 1. Princip :id=_1-koncept

- Fronta rozděluje zprávy mezi konkurenční příjemce; stejná zpráva může být doručena znovu.
- Téma s odběry nebo RabbitMQ exchange s navázanými frontami umožňuje více nezávislých příjemců.
- DLQ (dead-letter queue) odděluje odložené problematické zprávy; potřebuje dohled a postup opravy.
- Idempotentní příjemce provede stejný obchodní účinek jen jednou i při opakování. Trvalá deduplikace a zápis účinku musejí být správně koordinované, například v jedné databázové transakci.

| Oblast | Azure Service Bus | RabbitMQ |
|---|---|---|
| Provoz | Spravovaná služba, AMQP 1.0 | Vlastní nebo spravovaný broker; AMQP podle verze a konfigurace |
| Pořadí | Sessions umožňují pořadí v rámci relace | Závisí na frontě, příjemcích, potvrzení a opakování |
| Odložení chyb | DLQ entity | Dead-letter exchange nebo mechanismus klientské knihovny |

Zpracování „právě jednou“ nezajistí samotná fronta ani detekce duplicit na brokeru; zajišťuje je idempotentní příjemce.

## 2. Příklad

### Azure Service Bus – odesílání

**Metoda** serverové třídy, balíček `Azure.Messaging.ServiceBus`. `ServiceBusSender` získáte metodou `client.CreateSender("objednavky")` z dlouho žijícího `ServiceBusClient`, který aplikace vytvoří pro svůj namespace s oprávněnou identitou a na konci uvolní. Sender je bezpečné sdílet po celou dobu života klienta; uvolněním klienta skončí i jeho sendery. Fronta musí již existovat.

```csharp
using Azure.Messaging.ServiceBus;
public record Objednavka(Guid Id, string Produkt);
public static class Odesilani
{
    public static async Task PosliAsync(ServiceBusSender sender, Objednavka data, CancellationToken ct)
    {
        if (data.Id == Guid.Empty || string.IsNullOrWhiteSpace(data.Produkt))
            throw new ArgumentException("Neplatná objednávka.");
        var zprava = new ServiceBusMessage(BinaryData.FromObjectAsJson(data))
        {
            MessageId = data.Id.ToString("N"), ContentType = "application/json",
            TimeToLive = TimeSpan.FromDays(1)
        };
        await sender.SendMessageAsync(zprava, ct);
    }
}
```

Při opakování stejné operace zachovejte obchodní ID; nové náhodné MessageId při každém retry zmaří brokerovou deduplikaci. Ta navíc vyžaduje zapnutou podporu a vymezené časové okno, nenahrazuje idempotenci příjemce.

<span id="azure-service-bus-příjem-processor"></span>

### Azure Service Bus – příjem procesorem

**Celá pomocná třída** s kontraktem aplikační služby. Používá `Objednavka` výše a import `Azure.Messaging.ServiceBus`. `IObjednavky` potřebuje trvalou, atomickou implementaci, kterou ukázka nedodává.

```csharp
using Azure.Messaging.ServiceBus;
using System.Text.Json;
public interface IObjednavky
{
    Task ZpracujJednouAsync(Objednavka data, CancellationToken ct);
}
public static class Prijem
{
    public static async Task SpustAsync(ServiceBusClient client, IObjednavky sluzba, CancellationToken ct)
    {
        await using var processor = client.CreateProcessor("objednavky", new ServiceBusProcessorOptions
        { AutoCompleteMessages = false, MaxConcurrentCalls = 1 });
        processor.ProcessMessageAsync += async args =>
        {
            Objednavka? data;
            try { data = args.Message.Body.ToObjectFromJson<Objednavka>(); }
            catch (JsonException)
            {
                await args.DeadLetterMessageAsync(args.Message, "NeplatnyJson",
                    cancellationToken: args.CancellationToken);
                return;
            }
            if (data is null || data.Id == Guid.Empty || string.IsNullOrWhiteSpace(data.Produkt))
            {
                await args.DeadLetterMessageAsync(args.Message, "NeplatnaData",
                    cancellationToken: args.CancellationToken);
                return;
            }
            await sluzba.ZpracujJednouAsync(data, args.CancellationToken);
            await args.CompleteMessageAsync(args.Message, args.CancellationToken);
        };
        processor.ProcessErrorAsync += args =>
        {
            Console.Error.WriteLine($"Příjem zpráv selhal: {args.ErrorSource}");
            return Task.CompletedTask;
        };
        await processor.StartProcessingAsync(ct);
        try { await Task.Delay(Timeout.InfiniteTimeSpan, ct); }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
        finally
        {
            using var limit = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            await processor.StopProcessingAsync(limit.Token);
        }
    }
}
```

Samotné `StartProcessingAsync` konzolový proces neudrží při životě; zde čekáme na token hostitele a pak řízeně zastavíme příjem. Deset sekund je ukázkový limit ukončení, nikoli výchozí timeout služby. Klient žije déle než procesor; vlastník jej nakonec asynchronně uvolní.

Při `AutoCompleteMessages=true` SDK zprávu dokončí (complete) **jen po úspěšném doběhnutí handleru**. Vyhodí-li handler výjimku, SDK nevyřízenou zprávu bez ohledu na tuto volbu opustí (abandon) a broker ji později doručí znovu. [Kontrakt SDK](https://learn.microsoft.com/en-us/dotnet/api/azure.messaging.servicebus.servicebusprocessor.autocompletemessages?view=azure-dotnet). Ztráta zámku či potvrzení může vyvolat opakování i po úspěšném účinku.

<span id="rabbitmq-s-masstransit-doporučená-abstrakce"></span>

### RabbitMQ s MassTransit

**Registrace** před `Build()` v Generic Host projektu s balíčkem `MassTransit.RabbitMQ`, importem `MassTransit` a nakonfigurovanými přístupy. Vyžaduje běžící RabbitMQ broker; licenční a provozní podmínky posuďte pro zvolenou verzi MassTransit. Doplnit je třeba `IObjednavky` i jeho registraci.

```csharp
using MassTransit;
string uzivatel = builder.Configuration["RabbitMq:User"]
    ?? throw new InvalidOperationException("Chybí uživatel brokeru.");
string heslo = builder.Configuration["RabbitMq:Password"]
    ?? throw new InvalidOperationException("Chybí přihlašování brokeru.");
if (string.IsNullOrWhiteSpace(uzivatel) || string.IsNullOrWhiteSpace(heslo))
    throw new InvalidOperationException("Neplatné přihlašování brokeru.");
builder.Services.AddMassTransit(x =>
{
    x.AddConsumer<ObjednavkaConsumer>();
    x.UsingRabbitMq((ctx, cfg) =>
    {
        cfg.Host("localhost", "/", h =>
        {
            h.Username(uzivatel);
            h.Password(heslo);
        });
        cfg.ConfigureEndpoints(ctx);
    });
});
```

Jde o lokální broker s vlastním účtem, nikoli produkční přihlašování přes výchozí guest. Pro vzdálený broker nakonfigurujte TLS a důvěru certifikátu; lokální ukázku nekopírujte do veřejné sítě.

**Soubor `ObjednavkaConsumer.cs`** se stejnými kontrakty jako výše.

```csharp
using MassTransit;
public sealed class ObjednavkaConsumer(IObjednavky sluzba) : IConsumer<Objednavka>
{
    public Task Consume(ConsumeContext<Objednavka> ctx)
    {
        if (ctx.Message.Id == Guid.Empty || string.IsNullOrWhiteSpace(ctx.Message.Produkt))
            throw new ArgumentException("Neplatná objednávka.");
        return sluzba.ZpracujJednouAsync(ctx.Message, ctx.CancellationToken);
    }
}
```

## 3. Kdy použít

Service Bus nabízí spravované brokerové funkce, RabbitMQ flexibilní topologii a vlastní provozní volby. Abstrakce MassTransit nesjednotí automaticky všechny záruky brokerů. Pro propojení DB zápisu a zprávy zvažte transakční outbox (tabulku odchozích zpráv zapsanou ve stejné DB transakci) a dohled nad opakováním.

## 4. Časté chyby

- Potvrdit zprávu dříve než proběhne trvalý účinek, nebo očekávat atomickou transakci mezi libovolnou DB a brokerem.
- Považovat paměťový HashSet ID za trvalou deduplikaci přes restarty a více replik.
- Opakovat trvale chybný vstup donekonečna; nastavte maximální počet pokusů a sledujte DLQ/error fronty.
- Přebírat univerzální limity velikosti bez ověření plánu a protokolu; pro velká data je často vhodnější chráněná reference na blob.
