# Optimalizace práce s I/O (souborový systém, síťové operace)

I/O je čtení a zápis mimo paměť procesu: soubory, síť, databáze. Při optimalizaci rozlišujte **latenci** (jak dlouho trvá jedna operace) a **propustnost** (kolik dat nebo požadavků zvládnete za čas). Asynchronní I/O hlavně šetří vlákna při čekání; nezrychlí disk ani síť a není totéž co paralelní výpočet na CPU.

**Prostředí:** .NET 10 / C# 14. Chování asynchronního I/O závisí na OS, typu zařízení a API.

## 1. Princip :id=_1-koncept

### Proč blokující I/O škodí

Synchronní volání (`File.ReadAllText`, `stream.Read`, `.Result`) drží vlákno po celou dobu čekání. Na serveru s mnoha souběžnými požadavky se tak vlákna ThreadPoolu zabírají čekáním, fronta práce roste a runtime přidává další vlákna jen postupně. Každé vlákno má vlastní zásobník a přepínání mezi vlákny něco stojí.

`await` nad asynchronní operací vlákno vrátí ThreadPoolu. Zda po dobu čekání skutečně žádné vlákno neblokuje, závisí na implementaci: sokety jsou na Windows i Linuxu skutečně asynchronní, soubory na Linuxu .NET obvykle čte a zapisuje synchronně na vlákně ThreadPoolu. API je stejné, náklady jiné.

### Tři úrovně abstrakce pro I/O v .NET

| Abstrakce | Kdy použít |
|---|---|
| `File.ReadAllTextAsync` a podobné | Malé soubory, které stejně potřebujete celé v paměti |
| `Stream` (`FileStream`, `NetworkStream`, tělo HTTP) | Postupné čtení a zápis po blocích, kopírování proudů |
| `System.IO.Pipelines` (`PipeReader`/`PipeWriter`) | Parsování zpráv z proudu bez ruční správy bufferů |

## 2. Příklad

<span id="asynchronní-čtení-souboru-správně"></span>

### Asynchronní čtení souboru po blocích

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`: vytvoří dočasný soubor, spočítá jeho SHA-256 po blocích a soubor smaže.

```csharp
using System.Security.Cryptography;

string cesta = Path.Combine(Path.GetTempPath(), $"io-ukazka-{Guid.NewGuid():N}.bin");
try
{
    await File.WriteAllBytesAsync(cesta, Enumerable.Range(0, 300_000).Select(i => (byte)i).ToArray());
    var (delka, hash) = await SpocitejAsync(cesta, CancellationToken.None);
    Console.WriteLine($"{delka} B, SHA-256 {hash[..16]}");
}
finally
{
    File.Delete(cesta);
}

static async Task<(long Delka, string Hash)> SpocitejAsync(string cesta, CancellationToken ct)
{
    await using var stream = new FileStream(cesta, new FileStreamOptions
    {
        Mode = FileMode.Open,
        Access = FileAccess.Read,
        Share = FileShare.Read,
        BufferSize = 0, // Vnitřní buffer by jen kopíroval do našeho bufferu.
        Options = FileOptions.Asynchronous | FileOptions.SequentialScan
    });
    using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
    byte[] buffer = new byte[64 * 1024];
    long celkem = 0;
    int precteno;
    while ((precteno = await stream.ReadAsync(buffer, ct)) > 0)
    {
        hash.AppendData(buffer, 0, precteno); // ReadAsync smí vrátit méně bajtů, než je délka bufferu.
        celkem += precteno;
    }
    return (celkem, Convert.ToHexString(hash.GetHashAndReset()));
}
```

Výstup: `300000 B, SHA-256 5576A58A474142A5`. Paměť zůstává konstantní bez ohledu na velikost souboru. `FileOptions.Asynchronous` na Windows otevře soubor pro překryvné I/O; bez něj `ReadAsync` provede synchronní čtení na vlákně ThreadPoolu.

### Zápis souboru s bufferováním

**Metoda ve vlastní třídě; `radky` jsou data volajícího.**

```csharp
public static async Task ZapisRadkyAsync(string cesta, IEnumerable<string> radky, CancellationToken ct)
{
    await using var soubor = new FileStream(cesta, FileMode.CreateNew, FileAccess.Write,
        FileShare.None, bufferSize: 64 * 1024, useAsync: true);
    await using var writer = new StreamWriter(soubor); // UTF-8 bez BOM
    foreach (string radek in radky)
        await writer.WriteLineAsync(radek.AsMemory(), ct);
}   // DisposeAsync vyprázdní buffery writeru i souboru.
```

`FileStream` i `StreamWriter` mají vlastní buffer; další `BufferedStream` mezi nimi nic nepřidá. `FileMode.CreateNew` odmítne přepsat existující soubor. Zápis do souboru se tímto nestane atomickým: pro bezpečnou výměnu zapište do dočasného souboru a pak jej přejmenujte.

<span id="síťový-přístup-httpclient-správně"></span>

### Síťový přístup – HttpClient a streamování odpovědi

**Třída registrovaná přes `builder.Services.AddHttpClient<Stahovac>()`; URL i cílový proud dodá volající.**

```csharp
public sealed class Stahovac(HttpClient http)
{
    public async Task StahniAsync(Uri url, Stream cil, CancellationToken ct)
    {
        // Po přijetí hlaviček lze tělo číst postupně, bez načtení celé odpovědi do paměti.
        using var odpoved = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
        odpoved.EnsureSuccessStatusCode();
        await using var telo = await odpoved.Content.ReadAsStreamAsync(ct);
        await telo.CopyToAsync(cil, ct);
    }
}
```

`ReadAsStringAsync` by tělo načetlo celé do řetězce; to je v pořádku jen u malé odpovědi s limitem velikosti. Nový `HttpClient` pro každý požadavek zbytečně zakládá spojení a uvolněné sokety chvíli zůstávají ve stavu TIME_WAIT. Sdílený klient s `SocketsHttpHandler.PooledConnectionLifetime` nebo `IHttpClientFactory` spojení znovu používá a reaguje i na změny DNS.

<span id="systemiopipelines-pro-vysoký-throughput"></span>

### System.IO.Pipelines – parsování proudu zpráv

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`; vypíše tři řádky včetně posledního bez oddělovače. Malý buffer způsobí, že řádky mohou přesahovat hranice segmentů.

```csharp
using System.Buffers;
using System.IO.Pipelines;
using System.Text;

var data = new MemoryStream(Encoding.UTF8.GetBytes("první\ndruhá\ntřetí bez konce"));
var reader = PipeReader.Create(data, new StreamPipeReaderOptions(bufferSize: 4));
await CtiRadkyAsync(reader, Console.WriteLine, CancellationToken.None);

static async Task CtiRadkyAsync(PipeReader reader, Action<string> zpracuj, CancellationToken ct)
{
    try
    {
        while (true)
        {
            ReadResult vysledek = await reader.ReadAsync(ct);
            ReadOnlySequence<byte> buffer = vysledek.Buffer;
            while (ZkusPrecistRadek(ref buffer, out ReadOnlySequence<byte> radek))
                zpracuj(Encoding.UTF8.GetString(radek)); // Kopie vznikne před AdvanceTo.

            if (vysledek.IsCompleted)
            {
                if (!buffer.IsEmpty) zpracuj(Encoding.UTF8.GetString(buffer));
                reader.AdvanceTo(buffer.End);
                break;
            }
            // Spotřebováno po začátek neúplného řádku, prozkoumáno vše: další čtení počká na nová data.
            reader.AdvanceTo(buffer.Start, buffer.End);
        }
    }
    finally
    {
        await reader.CompleteAsync(); // I při výjimce nebo zrušení.
    }
}

static bool ZkusPrecistRadek(ref ReadOnlySequence<byte> buffer, out ReadOnlySequence<byte> radek)
{
    SequencePosition? konec = buffer.PositionOf((byte)'\n');
    if (konec is null) { radek = default; return false; }
    radek = buffer.Slice(0, konec.Value);
    buffer = buffer.Slice(buffer.GetPosition(1, konec.Value));
    return true;
}
```

Výstup: `první`, `druhá`, `třetí bez konce` na samostatných řádcích. Data z `ReadResult.Buffer` jsou platná jen do volání `AdvanceTo`. Produkční parser musí omezit maximální délku zprávy, jinak útočník bez oddělovače přiměje pipe držet stále více dat.

## 3. Kdy použít

- **Celé načtení souboru**: malé konfigurační nebo datové soubory se známým limitem velikosti.
- **Čtení po blocích**: velké soubory, hashování, kopírování, zpracování bez potřeby celého obsahu.
- **Streamování HTTP**: velké odpovědi, stahování do souboru, přeposílání proudu.
- **Pipelines**: síťové protokoly a formáty se zprávami různé délky, kde by ruční buffery byly složité.
- **Paralelní I/O**: jen s limitem souběžnosti, který respektuje kapacitu cílového systému (viz [Parallel.ForEachAsync](Parallel_ForEachAsync.md)).

## 4. Časté chyby

- **Synchronní I/O na serveru**: blokuje vlákna ThreadPoolu a zhoršuje odezvu ostatních požadavků.
- **Nový `HttpClient` pro každý požadavek**: ztrácí znovupoužití spojení a zatěžuje sokety. Konkrétní limit selhání závisí na OS a provozu.
- **Ignorování návratové hodnoty `ReadAsync`**: zpracování celého bufferu místo přečtených bajtů vede k chybným datům.
- **Načtení celého neznámého vstupu do paměti**: `ReadAllBytesAsync` nebo `ReadAsStringAsync` bez limitu umožní vyčerpat paměť.
- **Chybějící zrušení**: bez `CancellationToken` pokračuje stahování i po odpojení klienta.

---

<details>
<summary>Volitelné podrobnosti: async I/O v OS, Pipelines a velikost bufferu</summary>

### Jak async I/O funguje na úrovni OS

Na Windows .NET používá pro sokety a soubory otevřené s `FileOptions.Asynchronous` mechanismus IOCP (I/O Completion Ports): operace se zadá jádru a vlákno se uvolní, dokončení později zpracuje vlákno ThreadPoolu. Na Linuxu a macOS runtime pro sokety používá `epoll`/`kqueue`; souborové operace tam běžně probíhají synchronně na vlákně ThreadPoolu. Pokud vás zajímá konkrétní verze, ověřte ji v dokumentaci a měřením, nikoli z názvu metody.

### System.IO.Pipelines vs Stream

U `Stream` volající alokuje buffer, čte do něj a sám řeší zprávy rozdělené mezi dvě čtení. `PipeReader` poskytuje `ReadOnlySequence<byte>` z bufferů, které spravuje pipe, a voláním `AdvanceTo` sdělíte, kolik dat bylo spotřebováno a kolik jen prozkoumáno. Nezpracovaný zbytek tak zůstane k dispozici pro další čtení bez ručního kopírování. Kopie vznikají až tam, kde je vytvoříte, například převodem na `string`.

**Schéma.**

```text
Stream: vlastní buffer → Read → ruční spojení zbytku se dalším čtením → parser
Pipe:   ReadAsync → parser nad sekvencí segmentů → AdvanceTo(spotřebováno, prozkoumáno)
```

<span id="velikost-bufferu-praktická-pravidla"></span>

### Velikost bufferu

Výchozí buffer `FileStream` je 4 096 B. Pro sekvenční čtení velkých souborů bývají vhodné větší bloky (desítky kilobajtů), ale optimum závisí na zařízení, OS cache a práci s daty. Příliš velké buffery zvyšují paměť na souběžnou operaci a od 85 000 bajtů (včetně režie objektu) končí na LOH, haldě velkých objektů. Velikost určete měřením vlastního scénáře.

</details>
