# Výjimky a jejich ošetření

**Příklady:** .NET 10 / C# 14. Samostatné bloky C# jsou jednotlivé náhrady `Program.cs` v projektu `dotnet new console -f net10.0`, spouštěné přes `dotnet run`. Bloky nespojujte; fragmenty a ukázky s dalšími požadavky jsou označené.

Výjimka přeruší běžný tok programu. Zachytávejte ji tam, kde umíte obnovit činnost, nabídnout náhradní výsledek nebo ukončit operaci srozumitelně. Pouhé potlačení chyby správný stav neobnoví. Pro očekávaný neplatný vstup často stačí `TryParse`.

## Základní struktura: `try` / `catch` / `finally`

Ukázka nezávisí na lokalizovaném textu systémové výjimky.

```csharp
try
{
    Console.WriteLine(int.Parse("ne-cislo"));
}
catch (FormatException)
{
    Console.WriteLine("Zadejte celé číslo.");
}
finally
{
    Console.WriteLine("Operace dokončena.");
}
```

Výstup: `Zadejte celé číslo.` a `Operace dokončena.`. Specifičtější `catch` patří před obecnější. `finally` běží při běžném opuštění bloku i při šíření výjimky; násilné ukončení procesu není zárukou úklidu. Pro vlastněné prostředky preferujte [`using` / `await using`](File_IO.md). Vypůjčený prostředek bez dohody neuvolňujte.

## Běžné typy výjimek

| Výjimka | Typický případ |
|---|---|
| `ArgumentNullException` | Nepovolený argument `null` |
| `ArgumentOutOfRangeException` | Argument mimo rozsah; také index v `List<T>` |
| `IndexOutOfRangeException` | Index mimo pole |
| `InvalidOperationException` | Operace v neplatném stavu |
| `IOException` | Chyba vstupu/výstupu |
| `HttpRequestException` | Selhání HTTP požadavku; stavový kód nemusí existovat |
| `OperationCanceledException` | Zrušená operace; posuzujte příslušný token |

<span id="vyházení-výjimek"></span>

## Vyvolání výjimek

Nula je zde platná; záporný věk odmítneme.

```csharp
try
{
    NastavVek(0);
    NastavVek(-1);
}
catch (ArgumentOutOfRangeException ex) when (ex.ParamName == "vek")
{
    Console.WriteLine("Věk nesmí být záporný.");
}
static void NastavVek(int vek)
{
    ArgumentOutOfRangeException.ThrowIfNegative(vek);
    Console.WriteLine($"Věk: {vek}");
}
```

Výstup: `Věk: 0` a `Věk nesmí být záporný.`. Pro předání zachycené chyby dál použijte v `catch` samotné `throw;`. `throw ex;` přepisuje místo původního vyvolání v zásobníku volání. Filtr `when` testuje typované údaje, nikoli jazykově závislé `Message`.

## Vlastní výjimky

Vlastní typ má smysl, pokud jej volající potřebuje rozlišit a využít jeho údaje.

```csharp
try
{
    throw new NedostatekProstredkuException(100m);
}
catch (NedostatekProstredkuException ex)
{
    Console.WriteLine(ex.Castka == 100m ? "Chybí 100 Kč." : "Nedostatek prostředků.");
}
public sealed class NedostatekProstredkuException(decimal castka)
    : Exception("Nedostatek prostředků.")
{
    public decimal Castka { get; } = castka;
}
```

Výstup: `Chybí 100 Kč.`. Při obalování jiné chyby zachovejte původní výjimku jako `InnerException`; nevytvářejte nový typ pro každé chybové hlášení.

<details>
<summary>Volitelné: filtry when a odložené předání výjimky</summary>

Filtr `when`, použitý výše v části o vyvolání výjimek, se vyhodnotí ještě před vstupem do `catch`. Vrátí-li `false`, výjimka pokračuje k dalšímu `catch`, jako by tento blok neexistoval; zásobník volání přitom zůstane nedotčený.

`ExceptionDispatchInfo` zachová původní zásobník pro vyvolání mimo původní `catch`, například po odloženém zpracování. Běžné předání uvnitř `catch` řeší jednoduše `throw;`.

Zachycení konkrétní chyby je zde záměrnou demonstrací odkladu.

```csharp
using System.Runtime.ExceptionServices;
ExceptionDispatchInfo? zachycena = null;
try { Selzi(); }
catch (InvalidOperationException ex) { zachycena = ExceptionDispatchInfo.Capture(ex); }
try { zachycena?.Throw(); }
catch (InvalidOperationException ex)
{
    Console.WriteLine(ex.StackTrace?.Contains(nameof(Selzi), StringComparison.Ordinal) == true
        ? "Původ chyby zachován." : "Původ nebyl nalezen.");
}
[System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
static void Selzi() => throw new InvalidOperationException("Ukázková chyba.");
```

Výstup: `Původ chyby zachován.`. Atribut `MethodImpl(MethodImplOptions.NoInlining)` brání JIT kompilátoru vložit tělo `Selzi` přímo do volající metody; jinak by se její jméno v zásobníku nemuselo objevit a kontrola by nebyla spolehlivá. Podrobný zásobník patří do diagnostiky, ne do odpovědi s citlivými údaji.

</details>
