# Paralelní zpracování s `System.Threading.Channels`

`Channel<T>` je asynchronní fronta mezi **producentem** (zapisuje) a **konzumentem** (čte). Čekání na místo i na data probíhá přes `await`, takže neblokuje vlákna. Ohraničený kanál přidává **zpětný tlak** (backpressure): když konzument nestíhá, producent zpomalí.

**Prostředí:** .NET 10 / C# 14, `System.Threading.Channels` je součástí .NET (Core 3.0+).

## 1. Princip :id=_1-koncept

Každý kanál má `Writer` a `Reader`. Producent po posledním prvku zavolá `Writer.Complete()` (nebo `TryComplete(chyba)`): čtenáři dočtou zbylé prvky a `ReadAllAsync` skončí; s chybou ji čtenář dostane jako výjimku. **Bez dokončení čeká konzument navždy.** Každý prvek přečte právě jeden čtenář; s více čtenáři není zachováno pořadí zpracování.

### Channel vs BlockingCollection

| | `Channel<T>` | `BlockingCollection<T>` |
|---|---|---|
| Čekání | Asynchronní (`await`) | Synchronní, blokuje vlákno |
| Dokončení s chybou | `TryComplete(exception)` | Jen `CompleteAdding()` |
| Vhodné pro | ASP.NET Core, hostované služby, async pipeline | Dedikovaná vlákna, synchronní kód |

Viz [BlockingCollection](Paralelni_kolekce_blokujici.md).

### Ohraničený a neohraničený kanál :id=bounded-vs-unbounded

- **`Channel.CreateUnbounded<T>()`**: zápis vždy uspěje. Pokud producent předbíhá, roste paměť bez limitu.
- **`Channel.CreateBounded<T>(kapacita)`**: při plném kanálu `WriteAsync` čeká na místo (výchozí `FullMode.Wait`), nebo se podle režimu některý prvek zahodí.

## 2. Příklad

### Základní producent-konzument

**Fragment s tokenem `ct`, zdrojem `NactiPolozkyAsync` a vlastní `ZpracujAsync`.**

```csharp
var kanal = Channel.CreateBounded<Polozka>(capacity: 100);

async Task ProducentAsync()
{
    Exception? chyba = null;
    try
    {
        await foreach (var polozka in NactiPolozkyAsync(ct))
            await kanal.Writer.WriteAsync(polozka, ct); // Při plném kanálu čeká.
    }
    catch (Exception e) { chyba = e; throw; }
    finally { kanal.Writer.TryComplete(chyba); } // Dokončit vždy, i po chybě nebo zrušení.
}

async Task KonzumentAsync()
{
    await foreach (var polozka in kanal.Reader.ReadAllAsync(ct))
        await ZpracujAsync(polozka, ct);
}

await Task.WhenAll(ProducentAsync(), KonzumentAsync());
```

### Více konzumentů – paralelní zpracování

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`.

```csharp
using System.Threading.Channels;

var kanal = Channel.CreateBounded<int>(new BoundedChannelOptions(20) { SingleWriter = true });
Task<long>[] konzumenti = Enumerable.Range(0, 3).Select(_ => SectiAsync(kanal.Reader)).ToArray();

try
{
    for (int i = 1; i <= 1000; i++)
        await kanal.Writer.WriteAsync(i);
}
finally
{
    kanal.Writer.Complete();
}

long[] mezisoucty = await Task.WhenAll(konzumenti);
Console.WriteLine($"Celkem: {mezisoucty.Sum()}");

static async Task<long> SectiAsync(ChannelReader<int> ctenar)
{
    long soucet = 0;
    await foreach (int x in ctenar.ReadAllAsync())
        soucet += x;
    return soucet;
}
```

Výstup: `Celkem: 500500`, tedy každý prvek zpracoval právě jeden konzument. Jak se prvky rozdělily mezi konzumenty, se mezi běhy liší. `SingleWriter = true` je slib, že zapisuje jen jeden producent; kanál pak může použít jednodušší synchronizaci. Výchozí `false` je bezpečné pro více producentů.

### Pipeline – více kanálů za sebou

Každá fáze čte z jednoho kanálu a zapisuje do dalšího. Chyba se musí šířit dál: fáze dokončí svůj výstupní kanál s výjimkou a zruší ostatní fáze.

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`; ukazuje úspěšný i chybový průběh.

```csharp
using System.Threading.Channels;

Console.WriteLine($"Součet: {await SpustAsync(Enumerable.Range(1, 100), CancellationToken.None)}");
try
{
    await SpustAsync([1, 2, -3, 4], CancellationToken.None);
}
catch (ArgumentException e)
{
    Console.WriteLine($"Pipeline selhala: {e.Message}");
}

static async Task<int> SpustAsync(IEnumerable<int> vstup, CancellationToken ct)
{
    var surova = Channel.CreateBounded<int>(new BoundedChannelOptions(10) { SingleWriter = true, SingleReader = true });
    var upravena = Channel.CreateBounded<int>(new BoundedChannelOptions(10) { SingleWriter = true, SingleReader = true });
    using var zruseni = CancellationTokenSource.CreateLinkedTokenSource(ct);

    async Task ProducentAsync()
    {
        Exception? chyba = null;
        try
        {
            foreach (int x in vstup)
                await surova.Writer.WriteAsync(x, zruseni.Token); // Plný kanál producenta pozdrží.
        }
        catch (Exception e) { chyba = e; throw; }
        finally { surova.Writer.TryComplete(chyba); }
    }

    async Task TransformaceAsync()
    {
        Exception? chyba = null;
        try
        {
            await foreach (int x in surova.Reader.ReadAllAsync(zruseni.Token))
            {
                if (x < 0) throw new ArgumentException($"Záporná hodnota {x}.");
                await upravena.Writer.WriteAsync(x * 2, zruseni.Token);
            }
        }
        catch (Exception e) { chyba = e; throw; }
        finally
        {
            upravena.Writer.TryComplete(chyba); // Konzument dostane chybu místo nekonečného čekání.
            if (chyba is not null) zruseni.Cancel(); // Producent může čekat na místo; zastavit jej.
        }
    }

    async Task<int> KonzumentAsync()
    {
        int soucet = 0;
        await foreach (int x in upravena.Reader.ReadAllAsync(ct))
            soucet += x;
        return soucet;
    }

    Task producent = ProducentAsync(), transformace = TransformaceAsync();
    Task<int> konzument = KonzumentAsync();
    await Task.WhenAll(producent, transformace, konzument); // Pozoruje všechny fáze; vyhodí první chybu.
    return konzument.Result;
}
```

Výstup: `Součet: 10100` a `Pipeline selhala: Záporná hodnota -3.` Pokud producent při chybě ještě čeká na místo v kanálu, zrušení jej zastaví; `WhenAll` všechny fáze dočká, takže po návratu žádná neběží na pozadí.

### Režimy plného kanálu (BoundedChannelFullMode) :id=bounded-s-boundedchannelfullmode

**Kanál pro telemetrii, kde je přijatelné ztratit nejstarší vzorky.**

```csharp
var kanal = Channel.CreateBounded<Vzorek>(new BoundedChannelOptions(1000)
{
    FullMode = BoundedChannelFullMode.DropOldest,
    SingleReader = true
});
```

| Režim | Při plném kanálu |
|---|---|
| `Wait` (výchozí) | `WriteAsync` čeká, `TryWrite` vrátí `false` |
| `DropOldest` / `DropNewest` | Zahodí nejstarší, resp. nejnovější prvek ve frontě a zápis uspěje |
| `DropWrite` | Zahodí zapisovaný prvek; zápis se tváří jako úspěšný |

Zahazování se hodí jen tam, kde ztráta dat není chyba. `Channel.CreateBounded` má i přetížení s callbackem `itemDropped`, kterým lze ztráty počítat.

## 3. Kdy použít

- **Fronta v hostované službě**: endpoint zapíše úkol, `BackgroundService` jej zpracuje. Kanál je v paměti procesu; při restartu se obsah ztratí, trvalé úlohy patří do brokeru zpráv.
- **Vícefázová pipeline** s různou rychlostí fází a zpětným tlakem mezi nimi.
- **Rozdělení práce** mezi několik konzumentů (fan-out) s omezenou frontou.
- **Proudy událostí**, kde producent nesmí blokovat vlákno.

## 4. Časté chyby

- **Chybějící `Complete` ve `finally`**: po výjimce producenta konzument čeká navždy.
- **Chyba fáze bez `TryComplete(chyba)`**: navazující fáze skončí „úspěšně“ s neúplnými daty.
- **Neohraničený kanál bez důvodu**: rychlý producent vyčerpá paměť; začněte ohraničeným.
- **`TryWrite` u ohraničeného kanálu bez kontroly výsledku**: v režimu `Wait` vrátí `false` a prvek se ztratí.
- **`SingleReader`/`SingleWriter = true` při více čtenářích či zapisovatelích**: porušený slib vede k nedefinovanému chování.
- **Nepozorované úlohy fází**: čekejte na všechny (`WhenAll`), jinak výjimky zmizí a fáze mohou běžet dál.

---

<details>
<summary>Volitelné podrobnosti: implementace, měření a diagnostika</summary>

### Interní implementace

Neohraničený kanál využívá souběžnou frontu, ohraničený vnitřní frontu chráněnou zámkem. Čekání čtenářů i zapisovatelů vrací `ValueTask` a interně recykluje objekty čekání. Jde o implementační detail, který se mezi verzemi mění; navrhujte podle veřejného kontraktu (kapacita, režim, dokončení).

<span id="výkonové-srovnání-benchmarkdotnet-net-8"></span>

### Výkon a měření

Konkrétní časy se liší podle stroje a scénáře, proto je kapitola neuvádí. Propustnost kanálu závisí na velikosti prvků, počtu čtenářů a zapisovatelů, nastavení `Single*` a hlavně na práci ve fázích, která bývá řádově dražší než samotná fronta. Porovnání s `BlockingCollection` dělejte na vlastním scénáři přes [BenchmarkDotNet](Benchmarking.md).

### Diagnostika

**Měřidlo délky fronty; `kanal` je dlouho žijící kanál služby.**

```csharp
var meter = new Meter("MojeAplikace.Fronta");
meter.CreateObservableGauge("fronta.delka",
    () => kanal.Reader.CanCount ? kanal.Reader.Count : 0); // Ne každý kanál počet podporuje.
```

`ChannelReader<T>.Count` je dostupný jen při `CanCount == true`; jinak vyhodí `NotSupportedException`. Trvale rostoucí délka znamená, že konzumenti nestíhají: přidejte konzumenty, zrychlete zpracování nebo zpomalte producenta.

</details>
