# Základní pojmy v C#

**Příklady:** .NET 10 / C# 14, `dotnet new console -f net10.0`. Každý blok C# je samostatný `Program.cs` pro `dotnet run`, pokud není označen jiný kontext. Bloky nespojujte.

## 1. Proměnné a datové typy

Proměnná pojmenovává hodnotu určitého typu. Typ určuje operace i povolené hodnoty; `var` znamená odvození typu kompilátorem, nikoli dynamickou změnu typu.

| Typ | Význam | Příklad |
|---|---|---|
|`int`|32bitové celé číslo|`int vek = 15;`|
|`double`|Přibližné číslo s plovoucí řádovou čárkou|`double teplota = 36.5;`|
|`string`|Text v UTF-16|`string jmeno = "Petr";`|
|`bool`|Logická hodnota|`bool jeStudent = true;`|
|`char`|Jedna 16bitová jednotka UTF-16, ne vždy celý zobrazený znak|`char pismeno = 'A';`|

```csharp
int vek = 15;
string jmeno = "Petr";
bool jeStudent = true;
Console.WriteLine($"Jméno: {jmeno}, věk: {vek}");
Console.WriteLine(jeStudent ? "Student" : "Nestuduje");
```

Výstup: `Jméno: Petr, věk: 15` a `Student`. Interpolace `$"…{vyraz}…"` vloží hodnoty do textu.

## 2. Vstup a výstup

`Write` vypisuje bez konce řádku, `WriteLine` s koncem řádku. `ReadLine` vrací text nebo `null` při konci vstupu. `TryParse` vrací úspěch převodu jako `bool` a výsledek předá parametrem `out`.

```csharp
Console.Write("Zadejte jméno: ");
string? jmeno = Console.ReadLine();
Console.Write("Zadejte věk: ");
if (string.IsNullOrWhiteSpace(jmeno) ||
    !int.TryParse(Console.ReadLine(), out int vek) || vek < 0)
{
    Console.WriteLine("Neplatné jméno nebo věk.");
    return;
}
Console.WriteLine($"Ahoj, {jmeno}! Věk: {vek}.");
```

Pro řádky `Anna` a `20` končí výpis `Ahoj, Anna! Věk: 20.`. Záporný věk, nečíselný vstup i ukončený vstup vedou k chybové zprávě.

## 3. Komentáře

Komentář vysvětluje důvod nebo důležitou hranici; není vykonávaným příkazem.

```csharp
// Celočíselné dělení by ztratilo desetinnou část.
double podil = (double)5 / 2;
/* Pevná kultura zajišťuje stejný desetinný oddělovač ve výstupu. */
Console.WriteLine(podil.ToString(System.Globalization.CultureInfo.InvariantCulture));
```

Výstup: `2.5`. Bez převodu by `5 / 2` vrátilo celé číslo `2`.

<details>
<summary>Volitelné podrobnosti: Převody mezi typy</summary>

`int.Parse` při chybném formátu vyhodí `FormatException`, při hodnotě mimo rozsah `OverflowException` a při `null` `ArgumentNullException`. Pro běžný uživatelský vstup použijte `TryParse`. Převod `(int)3.9` odřízne desetinnou část směrem k nule, nezaokrouhlí na nejbližší celé číslo. Chování při překročení rozsahu závisí také na `checked` kontextu.

</details>
