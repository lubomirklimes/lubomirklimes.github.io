<span id="minimalizace-přepínání-vláken-a-threadpool-tuning"></span>

# Minimalizace přepínání vláken a ladění ThreadPoolu

`Task` není vlákno: je to objekt reprezentující dokončení operace. Kód úloh i pokračování po `await` ale běží na vláknech, typicky z **ThreadPoolu**. Když vlákna zbytečně blokují, ThreadPool jich potřebuje víc, roste fronta práce a s ní latence. Většinu problémů řeší odstranění blokování, ne změna nastavení.

**Prostředí:** .NET 10 / C# 14. Heuristiky ThreadPoolu jsou implementační detail a mezi verzemi .NET se mění.

## 1. Princip :id=_1-koncept

<span id="co-je-context-switch"></span>

### Co je přepnutí kontextu

Operační systém střídá vlákna na procesoru: uloží registry a stav jednoho vlákna a obnoví jiné (context switch). Cena závisí na hardwaru a OS a zahrnuje i ztrátu obsahu cache. Mnoho vláken soupeřících o málo jader tráví víc času přepínáním a méně užitečnou prací.

### ThreadPool v .NET

ThreadPool udržuje sadu pracovních vláken a frontu úloh. Do zvoleného minima vytváří vlákna okamžitě podle potřeby, nad ním je přidává postupně. Algoritmus hill climbing upravuje počet podle propustnosti a detekce **vyhladovění** (starvation) přidá vlákna, když fronta stojí. Od .NET 6 navíc blokující volání jako `Task.Wait` ThreadPool upozorní, aby mohl přidat vlákno rychleji. Konkrétní tempo se mění s verzí, proto na něm nestavte.

### Proč async/await snižuje přepínání

Synchronní čekání (`Thread.Sleep`, `.Wait()`, `.Result`, synchronní I/O) drží vlákno, které nic nedělá. `await` nad nedokončenou operací vlákno uvolní a pokračování se naplánuje, až operace skončí. Stejnou zátěž tak obslouží méně vláken. Async ale nezrychlí CPU výpočet; ten pořád potřebuje jádro.

**Deadlock versus vyhladovění:** deadlock je cyklické čekání, které se samo nevyřeší (typicky blokování vlákna se synchronizačním kontextem, viz [async a sync kód](Async_Sync_Interop.md)). Vyhladovění ThreadPoolu znamená, že práce čeká ve frontě, protože vlákna blokují; po přidání vláken se systém často „rozjede“, ale s velkou latencí.

## 2. Příklad

### Diagnostika – sledování ThreadPool

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`. Vypsané hodnoty závisí na stroji.

```csharp
ThreadPool.GetMinThreads(out int minPracovni, out int minIo);
ThreadPool.GetMaxThreads(out int maxPracovni, out int maxIo);
Console.WriteLine($"Pracovní vlákna: min {minPracovni}, max {maxPracovni}; I/O: min {minIo}, max {maxIo}");
Console.WriteLine($"Aktuálně vláken: {ThreadPool.ThreadCount}, čeká položek: {ThreadPool.PendingWorkItemCount}");
Console.WriteLine($"Dokončeno položek: {ThreadPool.CompletedWorkItemCount}");
```

V běžící aplikaci sledujte metriky `dotnet.thread_pool.queue.length` a `dotnet.thread_pool.thread.count` (meter `System.Runtime`, .NET 9+) přes `dotnet-counters`. Rostoucí fronta při nízkém využití CPU je typický příznak blokování.

<span id="setminthreads-eliminace-zpoždění-při-špičce"></span>

### SetMinThreads – jen po měření

**Začátek `Program.cs`; hodnota 64 je příklad, ne doporučení.**

```csharp
ThreadPool.GetMinThreads(out _, out int minIo);
if (!ThreadPool.SetMinThreads(workerThreads: 64, completionPortThreads: minIo))
    throw new InvalidOperationException("Neplatné minimum ThreadPoolu.");
```

Vyšší minimum zkrátí náběh při náhlé špičce, ale nemění příčinu, kterou je obvykle blokující kód. Příliš vysoké minimum vytvoří zbytečná vlákna a přepínání. Hodnotu zvolte podle zátěžového testu a metriky fronty; univerzální násobek počtu jader neexistuje. Nastavení lze dát i do konfigurace runtime (`System.Threading.ThreadPool.MinThreads`).

<span id="❌-anti-vzory-zbytečné-blokování"></span>

### Anti-vzory – zbytečné blokování

**Srovnání v asynchronní metodě s tokenem `ct`; `NactiDataAsync` je vlastní metoda.**

```csharp
// Blokuje vlákno ThreadPoolu po celou dobu čekání.
string data1 = NactiDataAsync(ct).Result;
Thread.Sleep(1000);

// Vlákno se během čekání uvolní.
string data2 = await NactiDataAsync(ct);
await Task.Delay(1000, ct);
```

`GetAwaiter().GetResult()` blokuje stejně jako `.Result`; liší se jen tím, že vyhodí původní výjimku místo `AggregateException`.

<span id="taskscheduler-omezení-souběžnosti"></span>

### Omezení souběžnosti CPU práce

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`; ukazuje dodržení limitu.

```csharp
using var limit = new SemaphoreSlim(2);
int aktivni = 0, maximum = 0;

var ulohy = Enumerable.Range(0, 8).Select(async _ =>
{
    await limit.WaitAsync(); // Čeká asynchronně, vlákno neblokuje.
    try
    {
        int nyni = Interlocked.Increment(ref aktivni);
        int predchozi;
        do predchozi = Volatile.Read(ref maximum);
        while (nyni > predchozi && Interlocked.CompareExchange(ref maximum, nyni, predchozi) != predchozi);

        await Task.Run(() => Vypocet(200_000)); // CPU práce mimo volající vlákno.
    }
    finally
    {
        Interlocked.Decrement(ref aktivni);
        limit.Release();
    }
});
await Task.WhenAll(ulohy);
Console.WriteLine($"Limit dodržen: {maximum <= 2}");

static long Vypocet(int n)
{
    long soucet = 0;
    for (int i = 0; i < n; i++) soucet += i % 7;
    return soucet;
}
```

Výstup: `Limit dodržen: True`. V ASP.NET Core je požadavek už na vlákně ThreadPoolu; `Task.Run` kolem CPU práce tam propustnost nezvýší, jen přidá přeplánování. Smysl má v UI aplikaci (uvolní UI vlákno) nebo pro záměrné oddělení a omezení výpočtu.

<span id="parallelforeachasync-správný-async-paralelismus"></span>

### Parallel.ForEachAsync – omezený async paralelismus

**Fragment s kolekcí `polozky`, tokenem `ct` a vlastní `ZpracujAsync`.**

```csharp
await Parallel.ForEachAsync(polozky,
    new ParallelOptions { MaxDegreeOfParallelism = 8, CancellationToken = ct },
    async (polozka, token) => await ZpracujAsync(polozka, token));
```

Na rozdíl od `Task.Factory.StartNew` s asynchronní lambdou vrací úlohu, která skutečně čeká na dokončení všech položek. Podrobnosti: [Parallel.ForEachAsync](Parallel_ForEachAsync.md).

<span id="_3-kdy-se-věnovat-threadpool-tuningu"></span>

## 3. Kdy ladit ThreadPool

- Metriky ukazují rostoucí frontu ThreadPoolu nebo pomalý náběh vláken a vysokou latenci při nízkém CPU.
- Trasa obsahuje události vyhladovění (starvation) ThreadPoolu.
- Aplikace musí volat blokující knihovnu třetí strany a blokování nelze odstranit; pak omezte souběžnost těchto volání a teprve potom zvažte minimum vláken.

Pokud profil ukazuje blokující volání ve vlastním kódu, opravte kód. Změna nastavení je až poslední krok.

## 4. Časté chyby

- **`.Result` a `.Wait()` v serverovém kódu**: blokují vlákna a při zátěži vedou k vyhladovění ThreadPoolu.
- **`Thread.Sleep` místo `await Task.Delay`**: drží vlákno nečinné.
- **Plošné zvýšení minima vláken**: maskuje příznak a přidá přepínání; měřte před změnou i po ní.
- **`new Thread` pro každou úlohu**: vytvoření vlákna je drahé. Dedikované vlákno má smysl jen pro dlouhodobou blokující práci.
- **`Task.Factory.StartNew(async () => ...)`**: vrací `Task<Task>`; vnější úloha skončí u prvního `await`. Použijte `Task.Run`, který async lambdu rozbalí.

---

<details>
<summary>Volitelné podrobnosti: hill climbing, IOCP a trasování</summary>

### Hill Climbing algoritmus

Hill climbing experimentálně mění počet pracovních vláken nad minimem a sleduje, zda roste propustnost dokončených položek. Reaguje postupně, proto při náhlé špičce s blokujícím kódem chvíli trvá, než vláken přibude. Detekce vyhladovění funguje nezávisle a přidává vlákna, když se fronta nehýbe.

### IOCP – I/O Completion Ports

Na Windows dokončení asynchronního I/O doručuje mechanismus IOCP a zpracují je vlákna ThreadPoolu určená pro I/O. Na Linuxu sokety obsluhují vlákna nad `epoll`. Význam a výchozí hodnoty `completionPortThreads` se mezi platformami a verzemi .NET liší; neměňte je bez měření.

### Diagnostika pomocí dotnet-trace

**Příkaz pro běžící proces; klíčové slovo 0x10000 zapíná události ThreadPoolu.**

```bash
dotnet-trace collect --process-id <pid> --providers Microsoft-Windows-DotNETRuntime:0x10000:4
```

V PerfView nebo Visual Studiu hledejte události úprav počtu vláken (`ThreadPoolWorkerThreadAdjustment`) s důvodem `Starvation` a zásobníky vláken, která v tu chvíli blokují.

</details>
