# Pole a seznamy

**Příklady:** .NET 10 / C# 14, `dotnet new console -f net10.0`. Každý blok C# je samostatný `Program.cs` pro `dotnet run`, pokud není označen jiný kontext. Bloky nespojujte.

Pole a seznamy seskupují více hodnot stejného typu. Index prvního prvku je `0`; posledního `počet - 1`.

## 1. Pole (`array`) – pevná velikost

```csharp
int[] cisla = [10, 20, 30, 40, 50];
Console.WriteLine(cisla[0]);
Console.WriteLine(cisla.Length);
for (int i = 0; i < cisla.Length; i++)
    Console.WriteLine(cisla[i]);
```

Výstup začíná `10`, `5`, potom obsahuje pět prvků. Velikost vytvořeného pole se nemění, ale prvkům lze přiřazovat nové hodnoty. Přístup za hranici vyhodí `IndexOutOfRangeException`.

Stejný průchod bez indexu:

```csharp
int[] cisla = [10, 20, 30, 40, 50];
foreach (int cislo in cisla)
    Console.WriteLine(cislo);
```

## 2. Seznam (`List<T>`) – dynamická velikost

`T` je parametr typu, například `List<string>` obsahuje řetězce. Podrobnosti: [generické typy](../B/Generics.md).

```csharp
List<string> jmena = [];
jmena.Add("Petr");
jmena.Add("Anna");
jmena.Add("Karel");
jmena.Remove("Anna");
foreach (string jmeno in jmena)
    Console.WriteLine(jmeno);
Console.WriteLine($"Počet: {jmena.Count}");
```

Výstup: `Petr`, `Karel`, `Počet: 2`.

| Člen | Kontrakt |
|---|---|
|`Add(prvek)`|Přidá na konec.|
|`Remove(prvek)`|Odebere první shodný prvek; vrací, zda byl nalezen.|
|`Count`|Vlastnost s počtem prvků, ne metoda.|
|`Contains(prvek)`|Zjistí přítomnost podle porovnání prvků.|
|`Clear()`|Odstraní všechny prvky; nemusí zmenšit rezervovanou kapacitu.|

Indexování seznamu používá `jmena[i]`; neplatný index vyvolá `ArgumentOutOfRangeException`. Počet prvků není totéž jako `Capacity`, tedy místo rezervované uvnitř seznamu.

## 3. Pole nebo seznam?

| Potřeba | Volba |
|---|---|
|Pevný počet prvků a indexování|Pole.|
|Postupné přidávání/odebírání|`List<T>`.|
|Pouhé procházení přes rozhraní ([OOP](OOP.md))|Často stačí `IEnumerable<T>`; neříká samo nic o změnitelnosti zdroje.|

Pole i seznam jsou referenční typy: proměnná obsahuje odkaz na objekt, takže `var b = a` nekopíruje prvky a obě proměnné ukazují na tutéž kolekci. Během `foreach` nad běžným seznamem neměňte jeho strukturu; potřebné změny sbírejte odděleně.

<details>
<summary>Volitelné podrobnosti: Vícerozměrná pole</summary>

```csharp
int[,] matice = { { 1, 2, 3 }, { 4, 5, 6 } };
Console.WriteLine(matice[0, 2]);
Console.WriteLine(matice[1, 0]);
Console.WriteLine($"Řádky: {matice.GetLength(0)}, sloupce: {matice.GetLength(1)}");
```

Výstup: `3`, `4`, `Řádky: 2, sloupce: 3`. Celková `Length` je 6. Obdélníkové pole `int[,]` se liší od pole polí `int[][]`, kde jednotlivé řádky mohou mít různé délky.

</details>
