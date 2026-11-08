# Řetězce a jejich zpracování

**Příklady:** .NET 10 / C# 14. Samostatné bloky C# jsou jednotlivé náhrady `Program.cs` v projektu `dotnet new console -f net10.0`, spouštěné přes `dotnet run`. Bloky nespojujte; fragmenty a ukázky s dalšími požadavky jsou označené.

`string` je neměnný: obsah existujícího řetězce nelze upravit. Operace vrací výsledek; nemusí vždy alokovat nový objekt, například když není co změnit. `Length` počítá jednotky UTF-16, nikoli nutně znaky vnímané uživatelem (emoji může zabrat více jednotek).

## Základní operace

Pro technické identifikátory používejte explicitní ordinální porovnání (podle kódových hodnot, bez jazykových pravidel); pro jazykové řazení jmen zvolte odpovídající kulturu.

```csharp
string s = "Ahoj, světe!";
Console.WriteLine(s.Length);
Console.WriteLine(s.ToUpperInvariant());
Console.WriteLine(s.ToLowerInvariant());
Console.WriteLine(s.Contains("svět", StringComparison.Ordinal));
Console.WriteLine(s.Replace("Ahoj", "Nazdar", StringComparison.Ordinal));
Console.WriteLine("  text  ".Trim());
```

Výstup: `12`, `AHOJ, SVĚTE!`, `ahoj, světe!`, `True`, `Nazdar, světe!`, `text`, každý na vlastním řádku. `Trim` odstraňuje bílé znaky na okrajích, nikoli uvnitř.

## Rozdělování a spojování

`Split` stačí pro jednoduchý oddělovaný seznam; neřeší CSV s uvozovkami a oddělovači uvnitř polí.

```csharp
string seznam = "Petr; Anna;;Karel";
string[] jmena = seznam.Split(';',
    StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
Console.WriteLine(string.Join(", ", jmena));
```

Výstup: `Petr, Anna, Karel`. Prázdné položky odstraňujte jen tehdy, když nemají vlastní význam.

## Interpolace a formátování

Interpolace běžně používá aktuální kulturu. Pro strojový výstup ji určete; pro uživatele naopak zvolte jeho kulturu.

```csharp
using System.Globalization;
string jmeno = "Petr";
Console.WriteLine($"Jméno: {jmeno}, věk: {30}");
decimal cena = 1234.5m;
Console.WriteLine(cena.ToString("F2", CultureInfo.InvariantCulture));
Console.WriteLine(cena.ToString("F2", CultureInfo.GetCultureInfo("cs-CZ")));
```

Výstup: `Jméno: Petr, věk: 30`, `1234.50`, `1234,50`. Dostupnost pojmenovaných kultur závisí na globalizační podpoře prostředí; ukázka není určena pro invariantní globalizační režim.

## Vyhledávání a řez

`IndexOf` vrací při nenalezení `-1`; před řezem jej zkontrolujte. Indexy i rozsahy pracují s UTF-16.

```csharp
string text = "Ahoj, světe!";
foreach (string hledane in new[] { "světe", "měsíci" })
{
    int index = text.IndexOf(hledane, StringComparison.Ordinal);
    Console.WriteLine(index >= 0 ? text.Substring(index, hledane.Length) : "Nenalezeno.");
}
Console.WriteLine(text[6..11]);
Console.WriteLine(text.StartsWith("ahoj", StringComparison.OrdinalIgnoreCase));
```

Výstup: `světe`, `Nenalezeno.`, `světe`, `True`.

<details>
<summary>Volitelné: StringBuilder pro opakované skládání</summary>

`StringBuilder` omezuje kopírování při opakovaném připojování. Pro několik hodnot bývá interpolace přehlednější; výkon měřte na skutečné zátěži.

```csharp
using System.Text;
var sb = new StringBuilder();
for (int i = 1; i <= 3; i++)
    sb.AppendLine($"Řádek {i}");
Console.Write(sb.ToString());
```

Výstup má tři řádky: `Řádek 1` až `Řádek 3`; zakončení řádku odpovídá platformě.

</details>
