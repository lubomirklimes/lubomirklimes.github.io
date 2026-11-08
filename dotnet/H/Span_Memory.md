# `Span<T>` a `Memory<T>` – zero-copy práce s pamětí

Tyto typy popisují souvislou oblast paměti bez kopie jejích prvků. **Zero-copy** znamená sdílený pohled na data, nikoli automaticky rychlejší celý program nebo nepřítomnost všech alokací.

**Prostředí:** .NET 10 / C# 14. Samostatné příklady jsou jednotlivé náhrady `Program.cs` v konzolovém projektu `dotnet new console -f net10.0`; spouštějí se přes `dotnet run`. Doplňkové fragmenty mají kontext uveden zvlášť.

## 1. Princip :id=_1-koncept

### Span\<T\>

`Span<T>` je `ref struct` s omezenou životností. Může odkazovat na část pole, paměť `stackalloc` či vhodně spravovanou nativní paměť. Nelze jej boxovat ani uložit do běžné třídy. Z toho neplyne, že odkazovaná data musí být na zásobníku: pole obvykle leží na haldě.

### Memory\<T\>

`Memory<T>` lze uložit do třídy a zachovat přes `await`; synchronní pohled poskytuje `.Span`. Pohled **nevlastní** zdroj: například buffer vrácený do poolu už nesmíte používat ani přes existující `Memory<T>`.

### ReadOnly varianty

`ReadOnlySpan<T>` a `ReadOnlyMemory<T>` zakazují zápis přes daný pohled. Nezaručují neměnnost podkladového pole, které může měnit jiný kód. `string.AsSpan()` poskytuje `ReadOnlySpan<char>`.

## 2. Příklad

### Span\<T\> – slice bez kopírování

**Samostatný příklad:** rozsah má konec nezahrnutý do výsledku.

```csharp
int[] numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
int[] copy = numbers[2..7];       // Nové pole s pěti prvky.
Span<int> view = numbers.AsSpan(2, 5); // Pohled: začátek a délka.
view[0] = 99;
Console.WriteLine($"Původní: {numbers[2]}, kopie: {copy[0]}");
```

Výstup: `Původní: 99, kopie: 3`. Platnost rozsahu hlídá API; pohled neprodlužuje smluvenou dobu používání zapůjčených dat.

### ReadOnlySpan\<char\> – práce s řetězcem bez alokace

**Samostatný příklad:** `ToString()` by vytvořilo nový řetězec, samotný výřez jej nevytváří.

```csharp
ReadOnlySpan<char> text = "Cena: 42 Kč".AsSpan();
int cena = int.Parse(text.Slice(6, 2));
Console.WriteLine(cena);
```

Výstup: `42`.

### stackalloc + Span

**Samostatný příklad**, pro malý pevný buffer:

```csharp
using System.Text;

Span<byte> buffer = stackalloc byte[32];
int pocet = Encoding.UTF8.GetBytes("Ahoj", buffer);
Console.WriteLine(Convert.ToHexString(buffer[..pocet]));
```

Výstup: `41686F6A`. Nově vyhrazenou paměť `stackalloc` nejprve naplňte; její počáteční obsah není zaručen. Žádná velikost není bezpečná vždy: volné místo na zásobníku závisí i na hloubce volání. Velké či opakované alokace v cyklu jsou rizikové; větší buffer si raději půjčte z [ArrayPool](ArrayPool.md).

### Memory\<T\> v asynchronní metodě

Od **C# 13** lze používat lokální `Span<T>` v async metodě, pokud jeho použití nepřekračuje hranici `await`. C# 14 toto umožňuje také. Parametr typu `Span<T>` v async metodě nadále není povolen; pro přenos bufferu použijte `Memory<T>`.

**Samostatný příklad:** po čtení vznikne pohled jen pro synchronní zpracování.

```csharp
using var stream = new MemoryStream(new byte[] { 1, 2, 3 });
Memory<byte> buffer = new byte[8];
int read = await stream.ReadAsync(buffer);
{
    Span<byte> data = buffer.Span[..read];
    Console.WriteLine(data.Length);
} // Pohled končí před dalším await.
await Task.Yield();
```

Výstup: `3`. Obecný stream smí vrátit méně bajtů, než bylo požadováno; úplné čtení vyžaduje odpovídající smyčku nebo `ReadExactlyAsync`.

### Parsování protokolu bez alokace

**Samostatný příklad:** zjednodušené rozdělení řádku požadavku, nikoli úplný validátor HTTP. Přijímá tři neprázdné části oddělené právě jednou mezerou; syntaxi metody, cíle a verze dál neověřuje.

```csharp
ReadOnlySpan<char> line = "GET /index.html HTTP/1.1".AsSpan();
int firstSpace = line.IndexOf(' ');
if (firstSpace <= 0) throw new FormatException("Chybí metoda nebo první mezera.");

ReadOnlySpan<char> rest = line[(firstSpace + 1)..];
int nextSpace = rest.IndexOf(' '); // Hledání začíná až ZA první mezerou.
if (nextSpace <= 0 || nextSpace == rest.Length - 1)
    throw new FormatException("Chybí cíl nebo verze.");
int secondSpace = firstSpace + 1 + nextSpace;

ReadOnlySpan<char> method = line[..firstSpace];
ReadOnlySpan<char> path = line[(firstSpace + 1)..secondSpace];
ReadOnlySpan<char> version = line[(secondSpace + 1)..];
if (version.Contains(' ')) throw new FormatException("Nadbytečná mezera.");
Console.WriteLine($"{method} | {path} | {version}");
```

Výstup: `GET | /index.html | HTTP/1.1`. Samotné vyhledání a výřezy nealokují řetězce; formátovaný výpis už ano.

## 3. Kdy použít

Pohledy se hodí pro parsování textu, části binárních bufferů a API s řízenou životností paměti. Pro přesun přes asynchronní čekání použijte `Memory<T>`; při zapůjčení z poolu musí vlastník zabránit předčasnému vrácení bufferu.

## 4. Časté chyby

- Záměna `array[2..7]` za pohled: pro pole je to kopie, `AsSpan(2, 5)` je pohled.
- Použití span lokálu po `await` nebo vrácení pohledu na lokální `stackalloc`: bezpečný C# odmítne neplatnou životnost.
- Výřez s neplatným začátkem či délkou: validujte hranice, zejména výsledek `IndexOf`, který může být `-1`.
- Představa, že read-only pohled vlastní data nebo brání změnám přes jiné reference.

<details>
<summary>Volitelné podrobnosti: Reinterpretace, pipeline a měření</summary>

### MemoryMarshal – pokročilá reinterpretace

**Samostatný příklad:** mění interpretaci stejných bajtů, ne jejich pořadí. Vyžaduje splněné požadavky API na typy a zarovnání platformy.

```csharp
using System.Runtime.InteropServices;

byte[] bytes = new byte[16];
Span<int> ints = MemoryMarshal.Cast<byte, int>(bytes.AsSpan());
ints[0] = 0x12345678;
Console.WriteLine(ints.Length);
```

Výstup: `4`. Pořadí bajtů závisí na endianness platformy; nejde o přenositelný síťový formát.

### System.IO.Pipelines

`PipeReader.ReadAsync` vrací `ReadResult`; jeho `Buffer` je `ReadOnlySequence<byte>`, případně s více segmenty. Jediný `Span<T>` celý vícesegmentový buffer nepokryje. Segmenty lze zpracovat synchronně, ale po `AdvanceTo` je nesmíte dál používat. Částečné zprávy vyžadují zachování nezpracovaných dat; dokončení čtenáře a výjimky musí řešit vlastník. Viz [I/O optimalizace](Optimalizace_IO.md).

### Měření výkonu :id=benchmarky-benchmarkdotnet

Konkrétní časy a alokace se liší podle runtime a hardwaru, proto je kapitola neuvádí. Výřez je jiná operace než kopírování. Porovnávejte ekvivalentní výsledky a skutečné alokace na cílovém runtime; postup uvádí [BenchmarkDotNet](Benchmarking.md).

</details>

Související: [řetězce a UTF-8](Stringy_utf8.md), [ref struct a readonly struct](Ref_Readonly_Struct.md).
