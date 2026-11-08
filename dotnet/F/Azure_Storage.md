# Azure Storage

Azure Storage zahrnuje objekty (Blob), zprávy (Queue), klíčově adresované entity (Table) a sdílené soubory (Files, podle nabídky SMB/NFS). Jednotlivé služby mají jiné klienty, oprávnění i transakční hranice. Příklady cílí na .NET 10; balíčky Azure SDK mají vlastní číslování verzí.

## 1. Princip :id=_1-koncept

| Služba | Důležitá hranice |
|---|---|
| Blob | Objekt a jeho metadata; přepsání a souběh řiďte podmínkami/ETag |
| Queue | Opakované doručení, omezená velikost zprávy, ne zaručené FIFO |
| Table | PartitionKey + RowKey; skupinová transakce ve stejném oddílu |
| Files | Síťový souborový protokol a jeho vlastní dostupnost/oprávnění |

Queue zpráva má limit 64 KiB včetně použitého kódování. TTL je doba platnosti: **výchozí hodnota je sedm dní**. U REST verze 2017-07-29 a novější lze nastavit libovolnou kladnou dobu nebo zprávu bez vypršení (`-1`). [Kontrakt Queue](https://learn.microsoft.com/en-us/azure/storage/queues/storage-queues-introduction).

Spravovaná identita se ověřuje tokenem, RBAC (role pro přístup ke zdrojům) uděluje oprávnění. `DefaultAzureCredential` vybírá z více zdrojů přihlášení; v provozu jeho volbu vědomě omezte nebo použijte konkrétní ManagedIdentityCredential.

## 2. Příklad

### Blob Storage – zápis, čtení a omezený přístup :id=blob-storage-upload-a-download

**Fragment:** tělo asynchronní metody s `BlobServiceClient serviceClient` a tokenem `ct`; balíček `Azure.Storage.Blobs`. Klienta vytvořte jednou pro aplikaci s URI existujícího účtu a oprávněním k datům.

```csharp
using Azure.Storage.Blobs;
var kontejner = serviceClient.GetBlobContainerClient("dokumenty");
var blob = kontejner.GetBlobClient("ukazka.txt");
await using (var vstup = new MemoryStream(System.Text.Encoding.UTF8.GetBytes("Ukázková data.")))
    await blob.UploadAsync(vstup, overwrite: false, cancellationToken: ct);
var response = await blob.DownloadStreamingAsync(cancellationToken: ct);
await using var obsah = response.Value.Content;
using var reader = new StreamReader(obsah);
string text = await reader.ReadToEndAsync(ct);
```

Kontejner musí již existovat; vytváření infrastruktury nepatří automaticky do každého requestu. Ukázka čte malý vlastní obsah celý do paměti. Pro velká či cizí data zpracovávejte proud s limitem. `overwrite:false` odmítne existující objekt; ETag podmínky se hodí pro řízené souběžné změny.

SAS je podepsaná adresa s vymezenými právy a platností. Metoda `GenerateSasUri` podepisuje SAS klíčem účtu (account key), proto funguje jen u klienta vytvořeného s tímto klíčem (`StorageSharedKeyCredential`); u klienta přihlášeného tokenem selže. Pro identitu z Microsoft Entra ID (dříve Azure Active Directory) použijte **user delegation SAS**:

**Metoda** v serverové třídě s importy `Azure.Storage.Blobs` a `Azure.Storage.Sas` (obojí z balíčku `Azure.Storage.Blobs`). Identita potřebuje datové oprávnění i právo získat delegační klíč na správném scope. Adresu vydávejte pouze autorizovanému příjemci; nelogujte její query.

```csharp
public static async Task<Uri> VytvorOdkazAsync(BlobServiceClient service, CancellationToken ct)
{
    var ted = DateTimeOffset.UtcNow;
    var konec = ted.AddMinutes(10);
    var klic = await service.GetUserDelegationKeyAsync(ted.AddMinutes(-1), konec, ct);
    var blob = service.GetBlobContainerClient("dokumenty").GetBlobClient("ukazka.txt");
    var sas = new BlobSasBuilder
    {
        BlobContainerName = "dokumenty", BlobName = "ukazka.txt", Resource = "b",
        StartsOn = ted.AddMinutes(-1), ExpiresOn = konec, Protocol = SasProtocol.Https
    };
    sas.SetPermissions(BlobSasPermissions.Read);
    return new BlobUriBuilder(blob.Uri)
    { Sas = sas.ToSasQueryParameters(klic.Value, service.AccountName) }.ToUri();
}
```

Deset minut je ukázková volba, nikoli univerzální bezpečnostní limit. Držitel SAS může využít přidělený přístup až do vypršení či účinného odvolání. [Delegovaný SAS v .NET](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blob-user-delegation-sas-create-dotnet).

### Queue Storage – producent a konzument :id=queue-storage-producent-a-konzument

**Fragment** v asynchronní metodě s tokenem `ct`, URI existující fronty `queueUri`, předanou funkcí `Func<int, CancellationToken, Task> zpracujJednouAsync`, balíčky Azure.Storage.Queues/Azure.Identity. Kódování Base64 řídí SDK na obou stranách, nepřidáváme ruční druhé kódování.

```csharp
using Azure.Identity;
using Azure.Storage.Queues;
var queue = new QueueClient(queueUri, new DefaultAzureCredential(),
    new QueueClientOptions { MessageEncoding = QueueMessageEncoding.Base64 });
await queue.SendMessageAsync("""{"id":42}""", cancellationToken: ct);
var response = await queue.ReceiveMessagesAsync(maxMessages: 1,
    visibilityTimeout: TimeSpan.FromSeconds(30), cancellationToken: ct);
foreach (var zprava in response.Value)
{
    using var json = System.Text.Json.JsonDocument.Parse(zprava.MessageText);
    if (json.RootElement.ValueKind != System.Text.Json.JsonValueKind.Object
        || !json.RootElement.TryGetProperty("id", out var id) || !id.TryGetInt32(out int cislo) || cislo <= 0)
        throw new InvalidDataException("Neplatná objednávka.");
    await zpracujJednouAsync(cislo, ct);
    await queue.DeleteMessageAsync(zprava.MessageId, zprava.PopReceipt, ct);
}
```

Funkce zpracujJednouAsync potřebuje vlastní trvalou idempotentní implementaci; výřez ji neposkytuje. Po příjmu zpráva není smazána, jen dočasně neviditelná; po vypršení či selhání potvrzení může přijít znovu. Dlouhá práce musí obnovovat neviditelnost a používat aktuální pop receipt. Chybné zprávy je nutné po omezených pokusech explicitně přesunout do vlastní poison fronty; obecné Queue SDK to za tuto smyčku neudělá.

<span id="registrace-v-di-doporučený-vzor"></span>

### Registrace klienta v DI

**Fragment** před `Build()` ve webovém projektu; balíčky Azure.Storage.Blobs a Azure.Identity, URI v běžné konfiguraci.

```csharp
using Azure.Identity;
using Azure.Storage.Blobs;
var endpoint = builder.Configuration["Storage:BlobUri"]
    ?? throw new InvalidOperationException("Chybí URI Blob účtu.");
builder.Services.AddSingleton(new BlobServiceClient(new Uri(endpoint), new ManagedIdentityCredential()));
```

Sdílené SDK klienty nevytvářejte při každém požadavku. Místně potřebujete odpovídající jiný zdroj identity či testovací úložiště, ne automaticky Azure Managed Identity.

## 3. Kdy použít

Blob se hodí pro objekty, Queue pro jednoduché oddělení práce, Table pro klíčové dotazy bez složitého relačního schématu. Pro brokerové funkce, sessions a DLQ porovnejte [Service Bus](Messaging.md).

## 4. Časté chyby

- Tokenové přihlášení bez datové role nestačí, ani když má identita obecnou roli správy účtu.
- Vestavěný retry SDK neřeší duplicitní aplikační účinky; po ztrátě odpovědi mohl zápis proběhnout.
- Base64 zvětší zprávu; pro větší obsah přenášejte referenci na chráněný blob s navrženou dobou uchování.
- Nelogujte account keys ani SAS. Krátká platnost nenahrazuje kontrolu, komu odkaz vydáváte.
