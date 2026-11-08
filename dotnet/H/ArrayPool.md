# Optimalizace alokace paměti pomocí `ArrayPool<T>`

`ArrayPool<T>` půjčuje pole k opakovanému použití. Na horké cestě (často prováděný kód) tak ubude alokací dočasných bufferů a s nimi i práce GC. Výměnou přebíráte odpovědnost za správné vrácení a za to, s jakou částí pole pracujete.

**Prostředí:** .NET 10 / C# 14, jmenný prostor `System.Buffers`. Širší kontext GC a haldy velkých objektů (LOH, Large Object Heap): [Správa paměti](Sprava_pameti.md), pohledy na pole: [Span a Memory](Span_Memory.md).

## 1. Princip :id=_1-koncept

Pravidla, která platí pro `ArrayPool<T>.Shared` i pro vlastní pool:

- `Rent(minimumLength)` vrátí pole **alespoň** požadované délky; často je delší. Pracujte s délkou, kterou jste požadovali nebo skutečně naplnili, ne s `array.Length`.
- Obsah vypůjčeného pole **není vynulovaný**: může obsahovat data předchozího vypůjčitele.
- Po `Return` pole nesmíte používat ani přes dříve vytvořený `Span` či `Memory`. Pool jej může hned půjčit jinému kódu.
- Pole vracejte jen jednou a do stejného poolu, ze kterého pochází. `Return(pole, clearArray: true)` vynuluje **celé** pole; má to cenu úměrnou délce.
- Nevrácené pole není únik paměti, GC ho uvolní. Pool pak jen ztrácí svůj přínos.

## 2. Příklad

### Základní vzor – Rent / Return

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`.

```csharp
using System.Buffers;

var zdroj = new MemoryStream(Enumerable.Range(0, 100_000).Select(i => (byte)i).ToArray());
var cil = new MemoryStream();
long zkopirovano = await KopirujAsync(zdroj, cil, CancellationToken.None);
Console.WriteLine($"Zkopírováno {zkopirovano} B, shodné: {zdroj.ToArray().AsSpan().SequenceEqual(cil.ToArray())}");

static async Task<long> KopirujAsync(Stream zdroj, Stream cil, CancellationToken ct)
{
    const int Pozadovano = 16 * 1024;
    byte[] buffer = ArrayPool<byte>.Shared.Rent(Pozadovano);
    try
    {
        // Pole může být delší a obsahovat stará data: pracujeme jen s oknem a přečtenými bajty.
        Memory<byte> okno = buffer.AsMemory(0, Pozadovano);
        long celkem = 0;
        int precteno;
        while ((precteno = await zdroj.ReadAsync(okno, ct)) > 0)
        {
            await cil.WriteAsync(okno[..precteno], ct);
            celkem += precteno;
        }
        return celkem;
    }
    finally
    {
        ArrayPool<byte>.Shared.Return(buffer); // Vrácení i při výjimce; poté už okno nepoužívat.
    }
}
```

Výstup: `Zkopírováno 100000 B, shodné: True`. Buffer přežívá `await`, proto je předán jako `Memory<byte>`, ne `Span<byte>`.

<span id="kombinace-s-idisposable-pro-elegantní-api"></span>

### Obal s IDisposable a jednorázovým vrácením

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`.

```csharp
using System.Buffers;

var buffer = new PujcenyBuffer(100);
Console.WriteLine(buffer.Span.Length);
buffer.Dispose();
buffer.Dispose(); // Druhé volání pole znovu nevrátí.
try { _ = buffer.Span.Length; }
catch (ObjectDisposedException) { Console.WriteLine("Po vrácení nelze použít."); }

public sealed class PujcenyBuffer(int delka) : IDisposable
{
    private byte[]? _pole = ArrayPool<byte>.Shared.Rent(delka);

    public Span<byte> Span => (_pole ?? throw new ObjectDisposedException(nameof(PujcenyBuffer))).AsSpan(0, delka);

    public void Dispose()
    {
        byte[]? pole = Interlocked.Exchange(ref _pole, null);
        if (pole is not null) ArrayPool<byte>.Shared.Return(pole);
    }
}
```

Výstup: `100` a `Po vrácení nelze použít.` Obal je třída, ne `struct`: kopie struktury by mohla stejné pole vrátit dvakrát. `Span`, který si někdo uložil před `Dispose`, obal neochrání; takový pohled nesmí přežít vlastníka.

### Vynulování citlivých dat

**Fragment; `OdesliAsync` je vlastní metoda přijímající `ReadOnlyMemory<byte>`.**

```csharp
byte[] buffer = ArrayPool<byte>.Shared.Rent(Encoding.UTF8.GetMaxByteCount(heslo.Length));
try
{
    int delka = Encoding.UTF8.GetBytes(heslo, buffer);
    await OdesliAsync(buffer.AsMemory(0, delka), ct); // Jen skutečně zapsané bajty, ne celé pole.
}
finally
{
    ArrayPool<byte>.Shared.Return(buffer, clearArray: true);
}
```

Vynulování zabrání tomu, aby data viděl další vypůjčitel poolu. Nezaručí, že tajná hodnota není jinde v paměti: `string heslo` je neměnný a zůstane na haldě, dokud jej GC neuvolní.

### Vlastní pool pro specifické požadavky

**Statické pole a metoda třídy.**

```csharp
private static readonly ArrayPool<byte> Pool = ArrayPool<byte>.Create(maxArrayLength: 64 * 1024, maxArraysPerBucket: 20);

public static void Zpracuj(ReadOnlySpan<byte> data)
{
    byte[] buffer = Pool.Rent(data.Length);
    try { data.CopyTo(buffer); /* ... */ }
    finally { Pool.Return(buffer); }
}
```

Vlastní pool odděluje buffery od zbytku aplikace a omezuje, kolik polí drží. Požadavek nad `maxArrayLength` dostane nové pole, které pool po vrácení nepodrží.

### MemoryPool\<T\> – pro System.IO.Pipelines

**Fragment asynchronní metody se `stream` a `ct`.**

```csharp
using IMemoryOwner<byte> vlastnik = MemoryPool<byte>.Shared.Rent(4096);
Memory<byte> pamet = vlastnik.Memory[..4096]; // Memory může být také delší než požadavek.
int precteno = await stream.ReadAsync(pamet, ct);
Zpracuj(pamet.Span[..precteno]);
// Dispose vlastníka vrátí paměť; poté ani `pamet` nepoužívejte.
```

`IMemoryOwner<T>` jasně vyjadřuje vlastnictví: kdo drží vlastníka, odpovídá za `Dispose`. Pipelines používají `MemoryPool<byte>` interně.

## 3. Kdy použít

- **Dočasné buffery na horké cestě**: čtení a zápis proudů, parsování protokolů, komprese, kódování.
- **Velké dočasné buffery**: pole o velikosti od 85 000 bajtů včetně režie se ukládají na LOH; opakovaným půjčováním se jejich alokace omezí.
- **Když měření ukáže tlak alokací** v konkrétním místě. U jednorázových nebo malých polí přináší pool spíše složitost než zisk.

## 4. Časté chyby

- **Práce s `array.Length`**: `Rent(100)` může vrátit delší pole; data za požadovanou délkou jsou stará nebo nesmyslná.
- **Chybějící `finally`**: výjimka obejde `Return` a pool ztrácí účinnost.
- **Použití po vrácení**: pole mezitím používá jiný kód, výsledkem je poškození dat bez výjimky.
- **Dvojí vrácení**: stejné pole se může dostat ke dvěma vypůjčitelům současně.
- **Citlivá data bez vynulování**: hesla nebo tokeny mohou uniknout dalšímu vypůjčiteli; použijte `clearArray: true` nebo `CryptographicOperations.ZeroMemory` pro použitou část.

---

<details>
<summary>Volitelné podrobnosti: implementace Shared, měření a System.Buffers</summary>

### Jak funguje ArrayPool\<T\>.Shared

`ArrayPool<T>.Shared` třídí pole do velikostních skupin (mocniny dvou) a drží malou zásobu na vlákno i sdílenou zásobu. Konkrétní typ, počty a velikosti jsou **implementační detail**, který se mezi verzemi .NET mění; kód na nich nesmí záviset. Pool může pole i zahodit, například při tlaku na paměť.

<span id="benchmarky-benchmarkdotnet-net-8-10k-iterací"></span>

### Měření přínosu

Konkrétní časy se liší podle stroje a runtime, proto je kapitola neuvádí. Přínos poolu závisí na velikosti pole, frekvenci, počtu vláken a na tom, zda se paměť vůbec stihne uvolnit v Gen 0. Porovnejte `new` a `Rent/Return` ve stejné operaci přes [BenchmarkDotNet](Benchmarking.md) s `[MemoryDiagnoser]` a potvrďte výsledek profilem celé aplikace.

### System.Buffers jmenný prostor

- `ArrayPool<T>`: půjčování polí.
- `MemoryPool<T>` a `IMemoryOwner<T>`: půjčování `Memory<T>` s vlastníkem.
- `ReadOnlySequence<T>`: data složená z více segmentů (Pipelines).
- `IBufferWriter<T>` a `ArrayBufferWriter<T>`: zápis do postupně rostoucího bufferu. `ArrayBufferWriter<T>` pole alokuje, z poolu si je nepůjčuje.

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`.

```csharp
using System.Buffers;
using System.Text;
using System.Text.Json;

var writer = new ArrayBufferWriter<byte>();
using (var json = new Utf8JsonWriter(writer))
    JsonSerializer.Serialize(json, new { Id = 42, Nazev = "Kniha" });
Console.WriteLine(Encoding.UTF8.GetString(writer.WrittenSpan));
```

Výstup: `{"Id":42,"Nazev":"Kniha"}`. `JsonSerializer` nemá přetížení přímo pro `IBufferWriter<byte>`; zapisuje přes `Utf8JsonWriter`, který buffer obalí. `WrittenMemory` lze pak odeslat například do těla HTTP odpovědi.

</details>
