# Optimalizace stringů a práce s UTF-8 v .NET

`string` v .NET je neměnná posloupnost **UTF-16 kódových jednotek** (`char`) uložená na haldě. Každá operace, která vrací nový text (`Substring`, `Split`, `+`, `ToUpper`), vytvoří nový objekt. Síť, soubory a JSON přitom obvykle pracují s **UTF-8 bajty**. Optimalizace spočívá v tom, kde se vyhnout zbytečným kopiím a převodům mezi kódováními.

**Prostředí:** .NET 10 / C# 14. Obecné principy `Span<T>` vysvětluje [Span a Memory](Span_Memory.md); zde jde o text.

## 1. Princip :id=_1-koncept

### UTF-16, UTF-8 a délka textu

`string.Length` počítá kódové jednotky UTF-16, ne znaky, které vidí uživatel. Znak mimo základní rovinu Unicode (například většina emoji) zabírá dvě jednotky (surrogate pair). UTF-8 kóduje stejný znak jedním až čtyřmi bajty.

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`.

```csharp
using System.Globalization;
using System.Text;

string text = "Kč\U0001F600"; // K, č a emoji mimo základní rovinu
Console.WriteLine($"Jednotky UTF-16: {text.Length}");
Console.WriteLine($"Bajty UTF-8: {Encoding.UTF8.GetByteCount(text)}");
Console.WriteLine($"Skalární hodnoty (Rune): {text.EnumerateRunes().Count()}");
Console.WriteLine($"Textové prvky: {new StringInfo(text).LengthInTextElements}");
```

Výstup: `4`, `7`, `3`, `3`. Limit „maximálně 50 znaků“ proto musí říct, co počítá. Pro oříznutí textu pro uživatele použijte textové prvky, pro limit úložiště bajty v cílovém kódování.

### Kde vzniká problém

**Přehled operací, které kopírují.**

```text
radek.Substring(0, 5)        → nový string, kopie pěti char
vysledek += cast  (v cyklu)  → každé spojení kopíruje celý dosavadní text: O(n²) kopírovaných znaků
Encoding.UTF8.GetString(...) → převod UTF-8 → UTF-16 a nový string
```

### Nástroje

| Problém | Řešení |
|---|---|
| Spojování v cyklu | `StringBuilder`, případně `string.Join`/`string.Concat` |
| Výřez bez kopie | `ReadOnlySpan<char>`, `AsSpan()` |
| Řetězec známé délky | `string.Create` |
| UTF-8 konstanty | literál `"text"u8` (C# 11) |
| Čtení a zápis JSON v UTF-8 | `Utf8JsonReader`, `Utf8JsonWriter` |

## 2. Příklad

### StringBuilder – spojování v cyklu :id=stringbuilder-concatenace-v-cyklu

**Fragment; `polozky` je kolekce volajícího.**

```csharp
var sb = new StringBuilder(capacity: 256); // Odhad kapacity omezí přealokace vnitřního bufferu.
foreach (var polozka in polozky)
    sb.Append(polozka.Nazev).Append(';');
string vysledek = sb.ToString(); // Výsledný string je samostatná kopie.
```

Pro známou kolekci řetězců je jednodušší `string.Join(';', nazvy)`. Několik spojení mimo cyklus (`a + b + c`) překladač převede na jedno `string.Concat`; `StringBuilder` tam nic nepřinese.

### ReadOnlySpan\<char\> – výřez bez alokace :id=readonlyspanltchargt-slice-bez-alokace

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`. `Split` nad `ReadOnlySpan<char>` je dostupný od .NET 9.

```csharp
using System.Globalization;

ReadOnlySpan<char> radek = "Odpověď: 42";
int dvojtecka = radek.IndexOf(':');
if (dvojtecka < 0) throw new FormatException("Chybí dvojtečka.");
Console.WriteLine(int.Parse(radek[(dvojtecka + 1)..].Trim(), CultureInfo.InvariantCulture));

ReadOnlySpan<char> csv = "10,20,12";
int soucet = 0;
foreach (Range cast in csv.Split(',')) // Vrací rozsahy, ne nové stringy.
    soucet += int.Parse(csv[cast], CultureInfo.InvariantCulture);
Console.WriteLine($"Součet: {soucet}");
```

Výstup: `42` a `Součet: 42`. Výřezy ani parsování nealokují řetězce; interpolovaný výpis ano. `CultureInfo.InvariantCulture` zajistí stejné parsování bez ohledu na jazyk systému.

<span id="stringcreate-tvorba-stringu-bez-intermediate-alokací"></span>

### string.Create – zápis přímo do nového řetězce

**Statická metoda; vhodné pro řetězec předem známé délky.**

```csharp
static string Kod(int cislo)
{
    // Délka výsledku musí být známá předem: "K-" a čtyři číslice.
    ArgumentOutOfRangeException.ThrowIfNegative(cislo);
    ArgumentOutOfRangeException.ThrowIfGreaterThan(cislo, 9999);
    return string.Create(6, cislo, (cil, hodnota) =>
    {
        cil[0] = 'K';
        cil[1] = '-';
        hodnota.TryFormat(cil[2..], out _, "D4", CultureInfo.InvariantCulture);
    });
}
```

Pro běžné převody (například `Convert.ToHexString`) už existuje optimalizované API. `string.Create` předá zapisovatelný buffer nového řetězce, takže nevzniká mezilehlý `char[]`. Lambda nesmí buffer uložit ani použít po návratu. Pro náhodné identifikátory použijte `RandomNumberGenerator`, pokud mají být nepředvídatelné; `Random` k tomu není určen.

<span id="utf-8-string-literály-net-7"></span>

### UTF-8 literály u8 (C# 11)

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`.

```csharp
using System.Text;

ReadOnlySpan<byte> telo = "{\"stav\":\"ok\"}"u8; // Bajty vzniknou při překladu, ne za běhu.
using var vystup = new MemoryStream();
vystup.Write(telo);
Console.WriteLine(Encoding.UTF8.GetString(vystup.ToArray()));
```

Výstup: `{"stav":"ok"}`. Literál `u8` je `ReadOnlySpan<byte>` a nelze jej držet přes `await`. Asynchronní `Stream.WriteAsync` přijímá `ReadOnlyMemory<byte>`; pro opakované odeslání si bajty uložte jednou: `static readonly byte[] Telo = "..."u8.ToArray();`.

<span id="utf8jsonwriter-json-bez-string-alokací"></span>

### Utf8JsonWriter – JSON přímo v UTF-8

**Fragment s `IBufferWriter<byte> cil` (například `PipeWriter` těla odpovědi) a objektem `uzivatel`.**

```csharp
using var json = new Utf8JsonWriter(cil);
json.WriteStartObject();
json.WriteString("jmeno"u8, uzivatel.Jmeno); // Názvy vlastností jako UTF-8 literály.
json.WriteNumber("vek"u8, uzivatel.Vek);
json.WriteEndObject();
json.Flush();
```

Writer zapisuje UTF-8 přímo do cílového bufferu bez mezilehlého JSON řetězce. Hodnoty z `string` se přitom převádějí z UTF-16. Úplný spustitelný příklad s `ArrayBufferWriter<byte>` je v kapitole [ArrayPool](ArrayPool.md).

<span id="interpolované-stringy-a-stringformat-kdy-jsou-ok"></span>

### Interpolace, string.Format a logování

Od C# 10 překladač u interpolovaných řetězců používá handler (`DefaultInterpolatedStringHandler`), který formátuje do půjčeného bufferu bez boxování hodnotových typů. Mimo horkou cestu je interpolace v pořádku.

U logování platí dvě různé věci:

- `log.LogDebug($"Data: {x}")` vytvoří řetězec vždy, i když je Debug vypnutý. Šablona `log.LogDebug("Data: {Hodnota}", x)` formátování odloží a zachová pojmenované pole.
- **Argumenty se vyhodnotí vždy.** `log.LogDebug("Data: {Hodnota}", DrahyVypocet())` zavolá `DrahyVypocet()` i při vypnutém Debug. Drahé výpočty obalte podmínkou:

**Fragment s `ILogger log`.**

```csharp
if (log.IsEnabled(LogLevel.Debug))
    log.LogDebug("Data: {Hodnota}", DrahyVypocet());
```

Generátor `[LoggerMessage]` odstraní parsování šablony a boxování, argumenty ale také vyhodnotí volající.

## 3. Kdy použít

- **`ReadOnlySpan<char>`**: parsování hlaviček, CSV a konfigurace, kde výsledkem je číslo nebo rozhodnutí, ne nový text.
- **`StringBuilder`**: text skládaný v cyklu nebo podmíněně z mnoha částí.
- **`string.Create`**: řetězec pevné nebo předem spočítané délky na horké cestě.
- **UTF-8 API**: síťové protokoly a JSON, kde by převod UTF-8 → UTF-16 → UTF-8 byl zbytečný.

Optimalizujte podle měření. Čitelný kód s několika alokacemi je mimo horkou cestu správná volba.

## 4. Časté chyby

- **`+=` v cyklu**: kopíruje rostoucí text při každém průchodu.
- **`Split` na horké cestě**: vytvoří pole a nový string pro každou část; u span API dostanete rozsahy.
- **`ToString()` výřezu bez potřeby**: pokud cílové API přijímá `ReadOnlySpan<char>`, kopie není nutná.
- **Záměna délky a znaků**: `Length`, počet bajtů UTF-8 a viditelné znaky se u diakritiky a emoji liší.
- **Parsování bez kultury**: `double.Parse("1.5")` se chová jinak v české a anglické kultuře. Pro strojová data uveďte `InvariantCulture`.

---

<details>
<summary>Volitelné podrobnosti: interning, CompositeFormat a měření</summary>

### String interning

Řetězcové literály se internují: stejný literál v sestavení odkazuje na jednu instanci. `string.Intern(s)` přidá dynamický řetězec do stejné tabulky; takové řetězce v praxi žijí do konce procesu. Použijte jej jen pro malou uzavřenou množinu opakujících se hodnot, nikdy pro vstup od uživatele.

### CompositeFormat (.NET 8+)

**Statické pole a volání v metodě.**

```csharp
private static readonly CompositeFormat Format =
    CompositeFormat.Parse("Uživatel {0} provedl akci {1} v {2:O}");

string zprava = string.Format(CultureInfo.InvariantCulture, Format, uzivatel, akce, cas);
```

Formátovací řetězec se rozparsuje jednou. Přínos má u často opakovaného formátování se stejnou šablonou, například z lokalizačních zdrojů.

### Měření :id=benchmarky-benchmarkdotnet-net-8

Konkrétní časy a alokace se liší podle runtime a hardwaru, proto je kapitola neuvádí. Pozor na srovnání neekvivalentních operací: například `int.Parse("42")` s literálem žádný nový string nealokuje. Porovnávejte ekvivalentní operace přes [BenchmarkDotNet](Benchmarking.md) s `[MemoryDiagnoser]` na cílovém runtime.

</details>
