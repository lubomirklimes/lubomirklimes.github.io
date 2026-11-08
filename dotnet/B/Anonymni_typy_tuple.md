# Anonymní typy a `Tuple`

**Příklady:** .NET 10 / C# 14, `dotnet new console -f net10.0`. Každý blok C# je samostatný `Program.cs` pro `dotnet run`, pokud není označen jiný kontext. Bloky nespojujte.

Anonymní objekt a n-tice seskupují hodnoty bez vlastní pojmenované datové třídy. Odlišují se typem, změnitelností i použitím v rozhraní metody.

## 1. Anonymní typy

```csharp
var osoba = new { Jmeno = "Petr", Vek = 30 };
Console.WriteLine($"{osoba.Jmeno}, {osoba.Vek} let");
```

Výstup: `Petr, 30 let`. Kompilátor vytvoří referenční typ s vlastnostmi pouze pro čtení. Neměnnost je mělká: odkazovaná kolekce může zůstat měnitelná.

Anonymní objekt **lze vrátit** například jako `object` nebo přes generické odvození typu. Jeho vygenerovaný název však nelze zapsat jako běžný návratový typ veřejné metody a volající s `object` nemá přímý staticky typovaný přístup k jeho vlastnostem. Pro stabilní API použijte pojmenovaný typ. Typické lokální použití je projekce `Select` v [LINQ](LINQ.md).

## 2. `ValueTuple` – více hodnot z metody

```csharp
static (string Jmeno, int Vek) ZiskejOsobu() => ("Petr", 30);
var osoba = ZiskejOsobu();
Console.WriteLine($"{osoba.Jmeno}, {osoba.Vek}");
```

Výstup: `Petr, 30`. Syntaxe `(string Jmeno, int Vek)` používá hodnotový typ `ValueTuple`. Jména položek pomáhají čitelnosti, ale nejsou součástí identity typu.

Samostatná varianta s rozbalením hodnot (dekonstrukcí):

```csharp
static (string Jmeno, int Vek) ZiskejOsobu() => ("Petr", 30);
var (jmeno, vek) = ZiskejOsobu();
var (_, jenVek) = ZiskejOsobu();
Console.WriteLine($"{jmeno}, {vek}, {jenVek}");
```

Výstup: `Petr, 30, 30`. `_` zahazuje nepotřebnou položku. N-tice je měnitelná a při přiřazení se kopíruje její hodnota; referenční položky ale dál odkazují na stejné objekty.

## 3. Kdy co použít

| Potřeba | Vhodná varianta |
|---|---|
|Krátká lokální projekce bez pojmenovaného modelu|Anonymní typ.|
|Několik souvisejících návratových hodnot|Pojmenovaná n-tice.|
|Veřejný kontrakt s pravidly a dokumentovanými členy|Vlastní třída, struktura nebo [record](Record.md).|

<details>
<summary>Volitelné podrobnosti: Starší Tuple</summary>

```csharp
var osoba = Tuple.Create("Petr", 30);
Console.WriteLine($"{osoba.Item1}, {osoba.Item2}");
```

Výstup: `Petr, 30`. `System.Tuple` je referenční typ s položkami jen pro čtení a jmény `Item1`, `Item2`. Pro nový krátký návrat více hodnot bývá pojmenovaný `ValueTuple` čitelnější; při práci s existujícím API respektujte jeho kontrakt.

</details>
