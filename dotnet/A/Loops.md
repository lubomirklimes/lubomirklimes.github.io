# Smyčky a opakování

**Příklady:** .NET 10 / C# 14, `dotnet new console -f net10.0`. Každý blok C# je samostatný `Program.cs` pro `dotnet run`, pokud není označen jiný kontext. Bloky nespojujte.

Smyčka opakuje tělo podle podmínky nebo pro jednotlivé prvky kolekce.

## 1. `for` – známý počet opakování

```csharp
for (int i = 1; i <= 5; i++)
    Console.WriteLine($"Krok: {i}");
```

Výstup: řádky `Krok: 1` až `Krok: 5`. Inicializace proběhne jednou, podmínka před průchodem a aktualizace po něm.

<span id="_2-while-opakuj-dokud-platí-podmínka"></span>

## 2. `while` – opakování podle podmínky

```csharp
int i = 1;
while (i <= 5)
{
    Console.WriteLine($"Počítám: {i}");
    i++;
}
```

Výstup má pět řádků s čísly 1–5. Pokud je podmínka nepravdivá na začátku, tělo neproběhne. Zapomenuté `i++` by zde vytvořilo nekonečnou smyčku.

<span id="_3-do-while-provéč-alespoň-jednou"></span>

## 3. `do-while` – alespoň jeden průchod

```csharp
int cislo;
do
{
    Console.Write("Zadejte číslo větší než 10: ");
    string? radek = Console.ReadLine();
    if (radek is null)
    {
        Console.WriteLine("Vstup ukončen.");
        return; // Konec vstupu nesmí způsobit nekonečné opakování.
    }
    if (!int.TryParse(radek, out cislo)) cislo = 0;
} while (cislo <= 10);
Console.WriteLine($"Zadané číslo: {cislo}");
```

Pro vstupy `abc`, `5`, `11` proběhnou tři pokusy a výsledek je `Zadané číslo: 11`. Podmínka se kontroluje po těle.

## 4. `break` a `continue`

```csharp
for (int i = 1; i <= 10; i++)
{
    if (i == 3) continue;
    if (i == 7) break;
    Console.WriteLine(i);
}
```

Výstup: `1`, `2`, `4`, `5`, `6` na samostatných řádcích. `continue` přejde k dalšímu průchodu nejbližší smyčky (u `for` nejprve k aktualizaci); `break` tuto smyčku ukončí.

## 5. `foreach` – procházení kolekce

```csharp
string[] barvy = ["modrá", "červená", "zelená"];
foreach (string barva in barvy)
    Console.WriteLine(barva);
```

Není potřeba spravovat index. Iterační proměnné `barva` nelze přiřadit jinou hodnotu; u reference lze podle API měnit samotný objekt. Změna struktury běžného `List<T>` během enumerace může vyvolat `InvalidOperationException`.

<details>
<summary>Volitelné podrobnosti: Vnořené smyčky</summary>

```csharp
for (int i = 1; i <= 5; i++)
{
    for (int j = 1; j <= 5; j++)
        Console.Write($"{i * j,4}");
    Console.WriteLine();
}
```

Vznikne tabulka 5×5: první řádek obsahuje 1–5, poslední 5, 10, 15, 20, 25. Počet průchodů je součin rozměrů; vnoření samo není chyba, rozhoduje velikost vstupu a práce v těle.

</details>
