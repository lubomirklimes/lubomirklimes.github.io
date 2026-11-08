# Základní kolekce a jejich použití

**Příklady:** .NET 10 / C# 14. Samostatné bloky C# jsou jednotlivé náhrady `Program.cs` v projektu `dotnet new console -f net10.0`, spouštěné přes `dotnet run`. Bloky nespojujte; fragmenty a ukázky s dalšími požadavky jsou označené.

Kolekci vybírejte podle operací a požadavků na pořadí, rovnost a souběh. „Rychlé hledání“ u hash tabulky znamená obvyklou charakteristiku, nikoli záruku stejné doby pro každý vstup.

## Přehled nejpoužívanějších kolekcí

| Kolekce | Typické použití |
|---|---|
|`List<T>`|Indexovaný seznam; počet se mění.|
|`Dictionary<TKey,TValue>`|Klíč → hodnota, unikátní klíče podle compareru.|
|`HashSet<T>`|Množina bez duplicit podle compareru.|
|`Queue<T>`|FIFO: první vložený prvek se první odebírá.|
|`Stack<T>`|LIFO: poslední vložený prvek se první odebírá.|

## `Dictionary<K, V>`

```csharp
var body = new Dictionary<string, int>(StringComparer.Ordinal) { ["Petr"] = 85, ["Anna"] = 92 };
body["Karel"] = 78;
Console.WriteLine(body["Anna"]);
Console.WriteLine(body.TryGetValue("Eva", out int hodnota) ? hodnota.ToString() : "Klíč nenalezen.");
foreach (var (jmeno, pocet) in body.OrderBy(p => p.Key, StringComparer.Ordinal))
    Console.WriteLine($"{jmeno}: {pocet}");
```

Výstup: `92`, `Klíč nenalezen.`, potom `Anna: 92`, `Karel: 78`, `Petr: 85`. Indexer při čtení chybějícího klíče vyhodí `KeyNotFoundException`; při zápisu klíč přidá nebo přepíše. `Add` duplicitní klíč odmítne. Výpis je výslovně seřazený, nespoléhá na pořadí enumerace slovníku.

## `HashSet<T>`

```csharp
HashSet<string> zeme = new(StringComparer.OrdinalIgnoreCase) { "CZ", "SK", "DE" };
bool pridano = zeme.Add("cz");
Console.WriteLine($"Počet: {zeme.Count}");
Console.WriteLine(pridano ? "Přidáno" : "Duplicita");
Console.WriteLine(zeme.Contains("sk") ? "Nalezeno" : "Nenalezeno");
```

Výstup: `Počet: 3`, `Duplicita`, `Nalezeno`. Comparer určuje rovnost a hashování. Neměňte vlastnosti klíče/prvku ovlivňující hash, dokud je uložen v hashované kolekci.

## `Queue<T>` a `Stack<T>`

```csharp
Queue<string> fronta = new();
fronta.Enqueue("první"); fronta.Enqueue("druhý");
Console.WriteLine(fronta.Dequeue());
Stack<int> zasobnik = new();
zasobnik.Push(1); zasobnik.Push(2);
Console.WriteLine(zasobnik.Pop());
Queue<int> prazdna = new();
Console.WriteLine(prazdna.TryDequeue(out _) ? "Odebráno" : "Fronta je prázdná.");
```

Výstup: `první`, `2`, `Fronta je prázdná.`. `Dequeue`/`Pop` prázdné kolekce vyhodí `InvalidOperationException`; Try varianty běžný neúspěch oznámí bez ní. Běžné kolekce nejsou automaticky bezpečné pro souběžné zápisy; řešení viz [paralelní kolekce v sekci H](../H/Paralelni_kolekce_concurrent.md).

<details>
<summary>Volitelné podrobnosti: Řazené, spojové a neměnné kolekce</summary>

```csharp
using System.Collections.Immutable;
var sorted = new SortedDictionary<string, int>(StringComparer.Ordinal) { ["b"] = 2, ["a"] = 1 };
Console.WriteLine(string.Join(", ", sorted.Select(p => $"{p.Key}={p.Value}")));
LinkedList<int> spojovy = new();
var uzel = spojovy.AddLast(2);
spojovy.AddBefore(uzel, 1);
Console.WriteLine(string.Join(", ", spojovy));
var puvodni = ImmutableList.Create(1, 2, 3);
var novy = puvodni.Add(4);
Console.WriteLine($"Počty: {puvodni.Count}, {novy.Count}");
```

Výstup: `a=1, b=2`, `1, 2`, `Počty: 3, 4`. Pro tento net10.0 projekt je `System.Collections.Immutable` dostupné bez dalšího balíčku; nezapomeňte using. Spojový seznam usnadňuje operace u již známého uzlu, nikoli náhodné indexování. Neměnná kolekce vrací nový výsledek místo změny starého, ale její referenční prvky mohou zůstat měnitelné.

</details>
