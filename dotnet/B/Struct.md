# Struktury (`struct`)

**Příklady:** .NET 10 / C# 14, `dotnet new console -f net10.0`. Každý blok C# je samostatný `Program.cs` pro `dotnet run`, pokud není označen jiný kontext. Bloky nespojujte.

`struct` je hodnotový typ: při běžném přiřazení se kopíruje jeho hodnota. Umístění dat není synonymem typu — struktura může být lokální proměnnou, prvkem pole (array) na haldě nebo datovou složkou objektu třídy.

## Základní použití

```csharp
Bod bod = new(10, 20);
Console.WriteLine(bod);
struct Bod
{
    public int X;
    public int Y;
    public Bod(int x, int y) { X = x; Y = y; }
    public override string ToString() => $"({X}, {Y})";
}
```

Výstup: `(10, 20)`. Malá datová hodnota je běžným použitím; nevhodně velké kopírované struktury mohou být drahé.

## Klíčový rozdíl: `struct` vs. `class`

```csharp
Bod a = new() { X = 5 };
Bod b = a;
b.X = 99;
BodClass c = new() { X = 5 };
BodClass d = c;
d.X = 99;
Console.WriteLine($"Struktura: {a.X}, třída: {c.X}");
object boxed = a; // Boxing uloží kopii hodnoty do objektu.
a.X = 7;
Console.WriteLine(((Bod)boxed).X);
struct Bod { public int X; }
class BodClass { public int X; }
```

Výstup: `Struktura: 5, třída: 99` a `5`. Přiřazení reference `d = c` kopíruje odkaz na stejný objekt, nikoli objekt. Boxing vytvoří objekt na haldě, takže i práce se strukturou může alokovat. Má-li struktura datovou složku (field) referenčního typu, kopie sdílí odkazovaný objekt.

| Vlastnost | `struct` | `class` |
|---|---|---|
|Běžné přiřazení|Kopie hodnoty|Kopie reference|
|Dědičnost|Ne z další struktury/třídy; může implementovat rozhraní|Jedna základní třída a rozhraní|
|Umístění|Závisí na kontextu a runtime|Instance běžně na spravované haldě; reference může být lokální|

<span id="readonly-struct-nezměnitelná-struktura"></span>

## `readonly struct` – omezení změn struktury

```csharp
Barva barva = new(10, 20, 30);
Console.WriteLine($"RGB: {barva.R}, {barva.G}, {barva.B}");
readonly struct Barva(byte r, byte g, byte b)
{
    public byte R { get; } = r;
    public byte G { get; } = g;
    public byte B { get; } = b;
}
```

Výstup: `RGB: 10, 20, 30`. `readonly` omezuje změny vlastních polí struktury a dává kompilátoru přesnější informace. Nezajišťuje hlubokou neměnnost objektů dostupných přes reference.

<details>
<summary>Volitelné podrobnosti: ref struct a omezená životnost</summary>

```csharp
Span<int> data = stackalloc int[2];
TempBuffer buffer = new() { Data = data };
buffer.Data[0] = 42;
Console.WriteLine(buffer.Data[0]);
ref struct TempBuffer { public Span<int> Data; }
```

Výstup: `42`. `ref struct` nelze boxovat ani uložit jako datovou složku (field) běžné třídy. Data, na která ukazuje, mohou přitom ležet i v poli (array) na haldě. Od C# 13 může `ref struct` implementovat rozhraní a generický parametr s omezením `allows ref struct` jej přijme; běžný `List<T>` takové omezení nemá, a proto ref strukturu neuloží. Omezení přes `await` a vlastnictví bufferu vysvětluje [Span/Memory](../H/Span_Memory.md).

</details>
