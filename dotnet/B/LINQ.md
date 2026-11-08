# Výrazy LINQ a zpracování kolekcí

**Příklady:** .NET 10 / C# 14, `dotnet new console -f net10.0`. Každý blok C# je samostatný `Program.cs` pro `dotnet run`, pokud není označen jiný kontext. Bloky nespojujte.

LINQ (Language Integrated Query) umožňuje filtrovat, transformovat a seskupovat data. Níže jde o LINQ nad `IEnumerable<T>` v paměti; `IQueryable<T>` může mít poskytovatele převádějícího dotaz například do SQL a odlišná omezení.

## 1. Základní metody

```csharp
int[] cisla = [1, 2, 3, 4, 5, 6, 7, 8];
Console.WriteLine(string.Join(", ", cisla.Where(c => c % 2 == 0)));
Console.WriteLine(string.Join(", ", cisla.Select(c => c * c)));
Console.WriteLine(string.Join(", ", cisla.OrderByDescending(c => c)));
Console.WriteLine($"Součet: {cisla.Sum()}, maximum: {cisla.Max()}");
Console.WriteLine(cisla.Average().ToString(System.Globalization.CultureInfo.InvariantCulture));
```

Výstupy: sudá čísla `2, 4, 6, 8`, mocniny `1, 4, 9, 16, 25, 36, 49, 64`, sestupně 8–1, součet 36, maximum 8 a průměr `4.5`.

## 2. Řetězení metod

`Where` a `Select` zde vytvářejí **odložený dotaz**: práci provede až procházení. `ToList` jej vyhodnotí a uloží výsledek. Řazení přes `OrderBy` musí při vyhodnocení nejprve zpracovat vstup.

```csharp
List<int> cisla = [1, 2, 3, 4, 5, 6, 7, 8];
var dotaz = cisla.Where(c => c > 3).Select(c => c * 2).OrderBy(c => c);
var snimek = dotaz.ToList();
cisla.Add(9);
Console.WriteLine(string.Join(", ", dotaz));
Console.WriteLine(string.Join(", ", snimek));
```

Výstup: `8, 10, 12, 14, 16, 18` a `8, 10, 12, 14, 16`. Opakované procházení dotazu může znovu číst změněný zdroj či opakovat vedlejší efekty.

## 3. Práce s objekty

```csharp
Student[] studenti = [new("Petr", 2), new("Anna", 1), new("Karel", 3)];
var vyborni = studenti.Where(s => s.Znamka == 1).Select(s => s.Jmeno);
Console.WriteLine(string.Join(", ", vyborni));
record Student(string Jmeno, int Znamka);
```

Výstup: `Anna`. Deklarace `Student` je až za příkazy nejvyšší úrovně. `Select` vybírá nebo vypočítává výslednou hodnotu, nikoli automaticky kopii celého objektu.

## 4. `First`, `Any`, `All`, `Count`

```csharp
int[] cisla = [1, 2, 3, 4, 5, 6, 7, 8];
Console.WriteLine(cisla.First(c => c > 5));
Console.WriteLine(cisla.Any(c => c > 10) ? "Nalezeno" : "Nenalezeno");
Console.WriteLine(cisla.All(c => c > 0) ? "Všechna kladná" : "Ne všechna kladná");
Console.WriteLine(cisla.Count(c => c % 2 == 0));
Console.WriteLine(Array.Empty<int>().All(c => c > 0) ? "Prázdná sekvence podmínku splňuje" : "Nesplňuje");
```

Výstup: `6`, `Nenalezeno`, `Všechna kladná`, `4` a zpráva o prázdné sekvenci. `First` bez shody vyhodí `InvalidOperationException`; `FirstOrDefault` vrátí výchozí hodnotu typu, která nemusí odlišit chybějící prvek od nalezené nuly či `null`. `Any` končí po první shodě; pro zjištění existence nepočítejte všechny prvky.

<details>
<summary>Volitelné podrobnosti: Dotazová syntaxe a GroupBy</summary>

Dotazová syntaxe se překládá na příslušné LINQ operátory, sama neznamená databázový dotaz:

```csharp
int[] cisla = [3, 2, 4, 1];
var suda = from c in cisla where c % 2 == 0 orderby c select c;
Console.WriteLine(string.Join(", ", suda));
```

Výstup: `2, 4`. Seskupení:

```csharp
Student[] studenti = [new("Petr", 2), new("Anna", 1), new("Karel", 2)];
foreach (var skupina in studenti.GroupBy(s => s.Znamka))
    Console.WriteLine($"Známka {skupina.Key}: {string.Join(", ", skupina.Select(s => s.Jmeno))}");
record Student(string Jmeno, int Znamka);
```

Výstup: `Známka 2: Petr, Karel` a `Známka 1: Anna`. Nad tímto zdrojem `GroupBy` při vyhodnocení sesbírá vstup; ne každý odložený operátor zpracovává každý prvek ihned do výstupu. Výkon posuzujte měřením konkrétní operace nad konkrétním zdrojem.

</details>
