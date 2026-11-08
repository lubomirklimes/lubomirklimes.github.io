# Záznamy (`record`)

**Příklady:** .NET 10 / C# 14, `dotnet new console -f net10.0`. Každý blok C# je samostatný `Program.cs` pro `dotnet run`, pokud není označen jiný kontext. Bloky nespojujte.

Záznam generuje hodnotové porovnání, formátovaný `ToString` a další členy pro datové modely. `record` bez dalšího určení znamená referenční `record class`; neměnnost není automatickou vlastností každého záznamu.

## Základní použití

```csharp
Osoba a = new("Petr", 30);
Osoba b = new("Petr", 30);
Console.WriteLine(a == b ? "Stejné hodnoty" : "Různé hodnoty");
Console.WriteLine(ReferenceEquals(a, b) ? "Stejný objekt" : "Různé objekty");
Console.WriteLine(a);
record Osoba(string Jmeno, int Vek);
```

Výstup: `Stejné hodnoty`, `Různé objekty`, `Osoba { Jmeno = Petr, Vek = 30 }`. Rovnost porovnává datové členy a u record tříd také typ za běhu: dva záznamy různých typů si nejsou rovné ani při stejných hodnotách.

## Kopírování s úpravou (`with`)

```csharp
Osoba puvodni = new("Petr", 30, ["čtení"]);
Osoba kopie = puvodni with { Vek = 31 };
kopie.Zajmy.Add("hudba");
Console.WriteLine($"Věk: {puvodni.Vek}, {kopie.Vek}");
Console.WriteLine($"Zájmy původní osoby: {puvodni.Zajmy.Count}");
record Osoba(string Jmeno, int Vek, List<string> Zajmy);
```

Výstup: `Věk: 30, 31` a `Zájmy původní osoby: 2`. `with` dělá **mělkou kopii**: odkaz na seznam se zkopíruje, seznam nikoli. `init` brání výměně reference po inicializaci, ne volání `Add`. Také rovnost seznamů je standardně referenční, nikoli porovnání všech jejich položek.

## `record class` vs. `record struct`

```csharp
OsobaVal osoba = new("Petr", 30);
osoba.Vek = 31;
Bod bod = new(1, 2);
Console.WriteLine($"Věk: {osoba.Vek}, bod: {bod.X}, {bod.Y}");
record class OsobaRef(string Jmeno, int Vek);
record struct OsobaVal(string Jmeno, int Vek);
readonly record struct Bod(int X, int Y);
```

Výstup: `Věk: 31, bod: 1, 2`.

| Varianta | Sémantika | Generované poziční vlastnosti |
|---|---|---|
|`record class`|Referenční typ, může dědit od record třídy|`get; init;`|
|`record struct`|Hodnotový typ, bez dědičnosti od dalšího uživatelského typu|`get; set;`|
|`readonly record struct`|Hodnotový typ s omezením změn|`get; init;`|

Hodnotový typ neznamená „vždy zásobník“; viz [struct](Struct.md).

## `record` vs. `class`

Běžná třída bez vlastního přetížení má u `==` referenční porovnání; record generuje hodnotové. Obyčejná třída může porovnání i `ToString` přepsat a obě varianty mohou obsahovat měnitelné členy. Record se hodí pro datové kontrakty, ale jeho hodnota použitá jako klíč nesmí měnit hash během pobytu ve slovníku.

<details>
<summary>Volitelné podrobnosti: Dědičnost a init</summary>

```csharp
Student student = new("Petr", "Gymnázium");
Console.WriteLine(student);
record Osoba(string Jmeno);
record Student(string Jmeno, string Skola) : Osoba(Jmeno);
```

Výstup: `Student { Jmeno = Petr, Skola = Gymnázium }`. Poziční vlastnosti record třídy mají `init`; lze ale výslovně definovat i měnitelnou vlastnost:

```csharp
Osoba osoba = new() { Jmeno = "Petr" };
osoba.Jmeno = "Anna";
Console.WriteLine(osoba.Jmeno);
record Osoba { public string Jmeno { get; set; } = "Neznámá"; }
```

Výstup: `Anna`. Hlubokou neměnnost je nutné navrhnout i pro vnořené hodnoty.

</details>
