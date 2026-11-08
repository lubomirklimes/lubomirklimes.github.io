# Cache a strategie ukládání do mezipaměti

Cache (mezipaměť) ukládá výsledek drahé operace, aby se další požadavky obešly bez opakovaného volání zdroje. Tím ale vzniká **kopie dat**, která může zastarat. Návrh cache je proto hlavně rozhodnutí, jak dlouho smí být data stará, kdo je zneplatní a co se stane při souběžném výpadku.

**Prostředí:** .NET 10 / C# 14. `IMemoryCache` a `IDistributedCache` jsou součástí ASP.NET Core; v konzolové aplikaci se přidají balíčky `Microsoft.Extensions.Caching.*`.

## 1. Princip :id=_1-koncept

Pojmy, které se v kapitole opakují:

- **Absolutní expirace**: položka vyprší v pevný okamžik nebo po pevné době od vložení.
- **Klouzavá expirace** (sliding): každý přístup posune vypršení; bez absolutní pojistky může populární položka zůstat navždy.
- **Invalidace**: explicitní odstranění položky po změně zdroje.
- **Cache stampede**: mnoho požadavků současně zjistí chybějící položku a všechny zatíží zdroj.
- **Vyřazení** (eviction): cache odstraní položky kvůli kapacitě nebo tlaku na paměť.

### IMemoryCache vs IDistributedCache

| Vlastnost | `IMemoryCache` | `IDistributedCache` (Redis, SQL Server…) |
|---|---|---|
| Kde jsou data | Paměť jednoho procesu, uložené objekty | Sdílená služba, serializované bajty |
| Sdílení mezi instancemi | Ne, každá instance má vlastní kopii | Ano |
| Restart procesu | Data zmizí | Přežijí podle nastavení služby |
| Cena čtení | Bez sítě a serializace | Síťové volání a deserializace |
| Selhání | Spolu s procesem | Samostatná závislost, kterou je nutné ošetřit |

Balíček `Microsoft.Extensions.Caching.Hybrid` (vydávaný od .NET 9, použitelný i v projektech pro .NET 8 a .NET Framework 4.6.2+) přidává `HybridCache`: kombinuje paměťovou a distribuovanou úroveň a v rámci procesu sdružuje souběžná načtení stejného klíče.

## 2. Příklad

<span id="imemorycache-základní-použití"></span>

### IMemoryCache s ochranou proti souběžnému načtení

`GetOrCreateAsync` u `IMemoryCache` **není atomické**: při souběžném výpadku může továrnu zavolat více požadavků. Následující obal zajistí, že v jednom procesu probíhá pro klíč nejvýš jedno načtení a ostatní na něj čekají.

**Samostatný `Program.cs`** v konzolovém projektu `net10.0` s balíčkem `Microsoft.Extensions.Caching.Memory` (`dotnet add package Microsoft.Extensions.Caching.Memory`). Zrušení jednoho čekajícího nezruší ostatní a výjimka zdroje se do cache neuloží, takže další volání načítá znovu.

```csharp
using System.Collections.Concurrent;
using Microsoft.Extensions.Caching.Memory;

using var cache = new MemoryCache(new MemoryCacheOptions { SizeLimit = 1_000 });
var nacitac = new JednoNacteni<int, string>(cache);
int volani = 0;

async Task<string> NactiZDatabazeAsync(int id, CancellationToken ct)
{
    Interlocked.Increment(ref volani);
    await Task.Delay(100, ct); // Simulace pomalého zdroje.
    return $"Produkt {id}";
}

var ulohy = Enumerable.Range(0, 20)
    .Select(_ => nacitac.ZiskejAsync(42, NactiZDatabazeAsync, TimeSpan.FromMinutes(5), CancellationToken.None));
string[] vysledky = await Task.WhenAll(ulohy);
Console.WriteLine($"Volání zdroje: {volani}, výsledek: {vysledky.Distinct().Single()}");

public sealed class JednoNacteni<TKey, TValue>(IMemoryCache cache) where TKey : notnull
{
    private readonly ConcurrentDictionary<TKey, Lazy<Task<TValue>>> _probihajici = new();

    public async Task<TValue> ZiskejAsync(TKey klic, Func<TKey, CancellationToken, Task<TValue>> nacti,
        TimeSpan platnost, CancellationToken ct)
    {
        if (cache.TryGetValue(klic, out TValue? ulozena)) return ulozena!;
        var nacteni = _probihajici.GetOrAdd(klic,
            k => new Lazy<Task<TValue>>(() => NactiAUlozAsync(k, nacti, platnost)));
        // Token volajícího ukončí jen jeho čekání; sdílené načtení pokračuje pro ostatní.
        return await nacteni.Value.WaitAsync(ct);
    }

    private async Task<TValue> NactiAUlozAsync(TKey klic, Func<TKey, CancellationToken, Task<TValue>> nacti,
        TimeSpan platnost)
    {
        try
        {
            if (cache.TryGetValue(klic, out TValue? ulozena)) return ulozena!;
            TValue hodnota = await nacti(klic, CancellationToken.None);
            cache.Set(klic, hodnota, new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = platnost,
                Size = 1 // Povinné, když má cache SizeLimit.
            });
            return hodnota;
        }
        finally
        {
            _probihajici.TryRemove(klic, out _); // Po chybě zkusí další požadavek načíst znovu.
        }
    }
}
```

Výstup: `Volání zdroje: 1, výsledek: Produkt 42`. Ochrana platí jen v jednom procesu; deset instancí aplikace může stále poslat deset načtení. Sdílené načtení zde nepoužívá token volajícího. Pokud zdroj může viset, dejte mu vlastní časový limit.

### IDistributedCache s Redis

**Fragmenty `Program.cs` a služby; balíček `Microsoft.Extensions.Caching.StackExchangeRedis`, typy `Kategorie` a `IKategorieRepo` jsou vlastní.**

```csharp
builder.Services.AddStackExchangeRedisCache(o =>
{
    o.Configuration = builder.Configuration.GetConnectionString("Redis");
    o.InstanceName = "MojeApp:"; // Prefix odděluje klíče aplikací na sdíleném serveru.
});

public sealed class KategorieSluzba(IDistributedCache cache, IKategorieRepo repo)
{
    private const string Klic = "kategorie:v1";

    public async Task<List<Kategorie>> ZiskejAsync(CancellationToken ct)
    {
        byte[]? ulozeno = await cache.GetAsync(Klic, ct);
        if (ulozeno is not null)
            return JsonSerializer.Deserialize<List<Kategorie>>(ulozeno)!;

        List<Kategorie> data = await repo.NactiVsechnyAsync(ct);
        await cache.SetAsync(Klic, JsonSerializer.SerializeToUtf8Bytes(data),
            new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1) }, ct);
        return data;
    }
}
```

Verze ve jméně klíče (`v1`) umožní změnit formát dat bez čtení starých záznamů. Rozhodněte, co se stane při nedostupném Redisu: obvykle je lepší číst ze zdroje s omezením zátěže než celý požadavek selhat.

<span id="cache-aside-nejběžnější-vzor"></span>

### Cache-aside a invalidace

Cache-aside znamená: zkus cache, při výpadku načti zdroj a výsledek ulož. Po změně dat nejdřív uložte zdroj, teprve potom položku odstraňte:

**Metoda služby s `IMemoryCache cache` a vlastním repozitářem.**

```csharp
public async Task AktualizujAsync(Produkt produkt, CancellationToken ct)
{
    await repo.UlozAsync(produkt, ct);
    cache.Remove($"produkt:{produkt.Id}");
}
```

I tak existuje krátké okno, kdy souběžný požadavek načte starou hodnotu a uloží ji zpět. Kde to vadí, použijte verzi záznamu, kratší expiraci nebo notifikaci o změně, a u distribuované cache odstraňte položku i v ostatních instancích.

## 3. Kdy použít

- **`IMemoryCache`**: data, u nichž nevadí, že každá instance má vlastní a případně jinou kopii (číselníky, výsledky výpočtů, konfigurace).
- **`IDistributedCache`**: sdílená data mezi instancemi, drahé výsledky, které mají přežít restart, nebo session data.
- **`HybridCache`**: kombinace obou s ochranou proti stampede v procesu, pokud lze přidat balíček `Microsoft.Extensions.Caching.Hybrid`.
- **Bez cache**: data, kde i krátká zastaralost způsobí chybu (zůstatek účtu, rezervace posledního kusu). Tam řešte výkon na úrovni zdroje.

## 4. Časté chyby

- **Předpoklad atomické továrny**: `GetOrCreate(Async)` nezaručuje jedno volání; při výpadku populárního klíče hrozí stampede.
- **Ukládání chyb a `null`**: výsledek přechodného selhání uložený na hodinu prodlouží výpadek. Rozlišujte „neexistuje“ od „nepodařilo se načíst“.
- **Neomezená cache**: bez `SizeLimit` nebo rozumné expirace roste paměť s počtem klíčů, například s ID z URL.
- **Klíče bez prefixu a verze**: sdílený Redis a změny formátu pak vedou ke kolizím a chybám deserializace.
- **Paměťová cache za load balancerem bez invalidace**: po změně dat vracejí instance různé výsledky až do expirace.

---

<details>
<summary>Volitelné podrobnosti: expirace, vyřazování a zápisové strategie</summary>

### Strategie expirace

Absolutní expirace je předvídatelná, ale když položky vzniknou naráz, naráz i vyprší. Přidejte k době náhodný rozptyl (jitter) a u populárních klíčů ochranu proti stampede. Klouzavou expiraci vždy kombinujte s absolutní horní mezí.

Data, která se už nemění (například report za uzavřený den), mohou mít dlouhou expiraci; report za aktuální den potřebuje krátkou. Expirace v minulosti znamená, že položka okamžitě vyprší.

### Vyřazování položek v MemoryCache :id=eviction-policies-v-memorycache

`MemoryCacheOptions.SizeLimit` stanoví kapacitu v jednotkách, které určujete sami (`Size` u každé položky). Při překročení cache odmítne nové položky a spustí kompakci, která odstraní vypršené a méně prioritní záznamy. `CacheItemPriority.NeverRemove` chrání položku před kompakcí, ne před expirací; neomezeně rostoucí množství takových položek vede k vyčerpání paměti.

**Fragment uvnitř továrny s `ICacheEntry entry`.**

```csharp
entry.Priority = CacheItemPriority.Low; // Při kompakci se odstraní dříve.
entry.Size = 1;
```

<span id="redis-výkon-a-latence"></span>

### Redis – latence a dávkování

Latence Redisu zahrnuje síť, serializaci a zatížení serveru; konkrétní hodnoty změřte ve svém prostředí. Mnoho malých volání stojí hlavně round-tripy. StackExchange.Redis umí příkazy odeslat dávkou:

**Fragment s `IConnectionMultiplexer redis` a kolekcí `klice` typu `RedisKey[]`.**

```csharp
IDatabase db = redis.GetDatabase();
RedisValue[] hodnoty = await db.StringGetAsync(klice); // Jeden příkaz MGET pro více klíčů.
```

### Write-through a write-behind

**Write-through** zapisuje do zdroje i cache v rámci jedné operace aplikace. Nejde o distribuovanou transakci: když jeden zápis selže, musíte rozhodnout o kompenzaci nebo položku zneplatnit.

**Write-behind** zapíše nejdřív do cache a do zdroje později. Je rychlejší pro zápis, ale při výpadku hrozí ztráta dat a potřebuje trvalou frontu a idempotentní zápis.

Pro většinu webových aplikací je nejjednodušší cache-aside s explicitní invalidací a krátkou expirací.

</details>
