# Paralelní kolekce v .NET – ConcurrentQueue, ConcurrentDictionary a další

Běžné kolekce (`List<T>`, `Dictionary<TKey,TValue>`, `Queue<T>`) nejsou bezpečné pro souběžný zápis: data se mohou tiše poškodit nebo nastane výjimka. Jmenný prostor `System.Collections.Concurrent` nabízí kolekce, u nichž jsou **jednotlivé operace** bezpečné z více vláken. Posloupnost operací (zkontroluj, pak změň) ale atomická není, pokud ji kolekce nenabízí jako jednu metodu.

**Prostředí:** .NET 10 / C# 14. Neměnné kolekce jsou v `System.Collections.Immutable` (součást .NET).

## 1. Princip :id=_1-koncept

- **`ConcurrentQueue<T>`** a **`ConcurrentStack<T>`** používají algoritmy bez zámků (lock-free) postavené na atomické instrukci compare-and-swap (CAS): změna se zapíše, jen pokud se hodnota mezitím nezměnila, jinak se pokus opakuje.
- **`ConcurrentDictionary<TKey,TValue>`** čte bez zámků a zápisy chrání několika zámky, z nichž každý pokrývá část slovníku. Zápisy do různých částí mohou probíhat souběžně.
- **`ConcurrentBag<T>`** drží seznam pro každé vlákno; vyplatí se, když stejná vlákna prvky přidávají i odebírají.

Výběr řídí tři otázky: záleží na pořadí (FIFO, LIFO, žádné)? Potřebujete atomické „přečti a změň“ (`AddOrUpdate`, `GetOrAdd`)? Stačí neměnný snímek, který se mění vzácně?

## 2. Příklad

### ConcurrentQueue – neblokující FIFO fronta

**Fragment; `LogZaznam` a `Uloz` jsou vlastní.**

```csharp
var fronta = new ConcurrentQueue<LogZaznam>();
Parallel.For(0, 1000, i => fronta.Enqueue(new LogZaznam(i)));

// TryDequeue vrátí false u prázdné fronty, nečeká.
while (fronta.TryDequeue(out var zaznam))
    Uloz(zaznam);
```

`ConcurrentQueue` sama na prvky nečeká. Pokud má konzument čekat na další data, použijte [Channel](Paralelni_zpracovani_Channels.md) nebo [BlockingCollection](Paralelni_kolekce_blokujici.md), ne smyčku s `Thread.Sleep`.

### ConcurrentDictionary – atomické operace

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`.

```csharp
using System.Collections.Concurrent;

var navstevy = new ConcurrentDictionary<string, int>();
string[] stranky = ["/", "/kontakt", "/"];
Parallel.For(0, 30_000, i => navstevy.AddOrUpdate(stranky[i % 3], 1, (_, stara) => stara + 1));
Console.WriteLine($"/: {navstevy["/"]}, /kontakt: {navstevy["/kontakt"]}");

int vytvoreni = 0;
var drahe = new ConcurrentDictionary<string, Lazy<string>>();
Parallel.For(0, 100, i =>
{
    // Továrna GetOrAdd může běžet víckrát; vytvoří ale jen levný Lazy. Drahá práce proběhne jednou.
    Lazy<string> hodnota = drahe.GetOrAdd("konfigurace", klic => new Lazy<string>(() =>
    {
        Interlocked.Increment(ref vytvoreni);
        return $"hodnota pro {klic}";
    }));
    _ = hodnota.Value;
});
Console.WriteLine($"Drahá továrna spuštěna: {vytvoreni}×");
```

Výstup: `/: 20000, /kontakt: 10000` a `Drahá továrna spuštěna: 1×`. `AddOrUpdate` zajistí, že se žádná změna neztratí, ale funkce `updateValueFactory` může při souběhu proběhnout víckrát a běží mimo zámek. Nesmí proto mít vedlejší efekty (I/O, zápis jinam).

### ConcurrentStack – LIFO zásobník

**Fragment.**

```csharp
var zasobnik = new ConcurrentStack<int>();
zasobnik.PushRange([1, 2, 3, 4, 5]); // Vloží celý rozsah atomicky.

if (zasobnik.TryPop(out int vrchol))
    Console.WriteLine(vrchol); // 5

int[] davka = new int[3];
int odebrano = zasobnik.TryPopRange(davka); // Vrátí skutečný počet: 0 až 3.
```

### ConcurrentBag – neuspořádaná kolekce

**Fragment s kolekcí `zdroj` a čistou funkcí `Zpracuj`.**

```csharp
var vysledky = new ConcurrentBag<Vysledek>();
Parallel.ForEach(zdroj, polozka => vysledky.Add(Zpracuj(polozka)));

// Pořadí výčtu není dané a mezi běhy se liší.
foreach (var vysledek in vysledky)
    Console.WriteLine(vysledek);
```

Pro sběr výsledků z paralelní smyčky bývá jednodušší zapisovat do pole podle indexu nebo použít PLINQ `ToArray()`.

<span id="immutable-collections-thread-safe-čtení-bez-zámků"></span>

### Neměnné kolekce – čtení bez zámků

Neměnnou (immutable) kolekci nelze změnit; každá „změna“ vrátí novou instanci. Libovolný počet vláken ji proto může číst bez zámků. Sdílený stav pak tvoří jen **reference** na aktuální verzi, kterou je nutné vyměnit atomicky.

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`.

```csharp
using System.Collections.Immutable;

var konfigurace = new Konfigurace();
Parallel.For(0, 100, i => konfigurace.Nastav($"klic{i % 10}", i.ToString()));
Console.WriteLine($"Klíčů: {konfigurace.Aktualni.Count}");

ImmutableDictionary<string, string> snimek = konfigurace.Aktualni;
konfigurace.Nastav("novy", "x");
Console.WriteLine($"Starý snímek se nezměnil: {!snimek.ContainsKey("novy")}");

sealed class Konfigurace
{
    private ImmutableDictionary<string, string> _data = ImmutableDictionary<string, string>.Empty;

    public ImmutableDictionary<string, string> Aktualni => Volatile.Read(ref _data);

    // Update opakuje transformaci, dokud CompareExchange nevymění referenci bez souběžné změny.
    public void Nastav(string klic, string hodnota) =>
        ImmutableInterlocked.Update(ref _data, (data, zmena) => data.SetItem(zmena.klic, zmena.hodnota), (klic, hodnota));
}
```

Výstup: `Klíčů: 10` a `Starý snímek se nezměnil: True`. Transformace se může při souběhu spustit víckrát, proto musí být čistá. Ruční smyčka s `Interlocked.CompareExchange` dělá totéž; `Interlocked.Exchange` by souběžnou změnu přepsal.

## 3. Kdy použít

| Kolekce | Pořadí | Typický scénář |
|---|---|---|
| `ConcurrentQueue<T>` | FIFO | Předávání prvků mezi vlákny bez čekání, buffery událostí |
| `ConcurrentStack<T>` | LIFO | Zásobníky znovu použitelných objektů |
| `ConcurrentBag<T>` | Žádné | Vlákna přidávají i odebírají vlastní prvky |
| `ConcurrentDictionary<K,V>` | Žádné | Cache v procesu, čítače, mapy stavů |
| `ImmutableDictionary`/`ImmutableList` | Podle typu | Sdílená konfigurace, často čtená a zřídka měněná |

## 4. Časté chyby

- **Továrna s vedlejšími efekty v `GetOrAdd`/`AddOrUpdate`**: může běžet víckrát; drahé vytvoření obalte do `Lazy<T>`.
- **Kontrola a akce zvlášť**: `if (!dict.ContainsKey(k)) dict[k] = v;` není atomické; použijte `TryAdd` nebo `GetOrAdd`.
- **Rozhodování podle `Count` nebo `IsEmpty`**: hodnota může být zastaralá dřív, než ji použijete. Volejte rovnou `TryDequeue`/`TryPop`. `ConcurrentDictionary.Count` v současné implementaci navíc získá všechny zámky a je drahý.
- **`ConcurrentBag` pro FIFO**: pořadí není zaručeno.
- **Neměnné kolekce pro časté zápisy**: každá změna alokuje; při vysoké frekvenci zápisů je `ConcurrentDictionary` vhodnější.

---

<details>
<summary>Volitelné podrobnosti: lock-free fronta, zámky slovníku a sdílení struktury</summary>

### Jak funguje lock-free ConcurrentQueue

`ConcurrentQueue<T>` ukládá prvky do segmentů (polí) propojených do seznamu. Vložení i odebrání posouvá index pomocí CAS; při souběhu jedno vlákno uspěje a druhé opakuje pokus, bez zámku a uspání vlákna. Při vysoké kontenci (mnoho vláken na stejném konci fronty) opakované pokusy a sdílené cache řádky propustnost snižují. Zda je rychlejší než `lock` nad `Queue<T>`, záleží na scénáři; ověřte měřením. Výčet fronty vrací snímek okamžitého obsahu.

### ConcurrentDictionary – zámky a čtení :id=concurrentdictionary-segmentace

Čtení (`TryGetValue`, indexer) zámky nepoužívá. Zápis získá jeden z několika zámků podle hashe klíče. Počet zámků lze ovlivnit parametrem `concurrencyLevel` konstruktoru; výchozí hodnota i vnitřní uspořádání jsou implementační detail. Výčet slovníku **není** snímek: může, ale nemusí obsahovat změny provedené během výčtu. Pro konzistentní kopii použijte `ToArray()`.

**Konstruktor s odhadem velikosti.**

```csharp
var slovnik = new ConcurrentDictionary<string, int>(
    concurrencyLevel: Environment.ProcessorCount,
    capacity: 1000); // Počáteční kapacita omezí přealokace při plnění.
```

### Neměnné kolekce a sdílení struktury :id=immutable-collections-a-structural-sharing

`ImmutableList<T>` a `ImmutableDictionary<K,V>` jsou vyvážené stromy: nová verze sdílí s původní většinu uzlů, změna stojí O(log n) alokací. `ImmutableArray<T>` je obal nad polem: čtení je stejně rychlé jako u pole, ale každá změna kopíruje celé pole. Hodí se pro data, která se vytvoří jednou (například přes `ImmutableArray.CreateBuilder<T>()`) a pak se jen čtou.

</details>

Související: [Channels](Paralelni_zpracovani_Channels.md), [BlockingCollection](Paralelni_kolekce_blokujici.md), [TPL a PLINQ](TPL_PLINQ.md).
