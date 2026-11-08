<span id="generics-generické-typy-a-metody"></span>


# Generické typy a metody

**Příklady:** .NET 10 / C# 14, `dotnet new console -f net10.0`. Každý blok C# je samostatný `Program.cs` pro `dotnet run`, pokud není označen jiný kontext. Bloky nespojujte.

Generický parametr zastupuje typ zvolený při použití, například `List<int>`. Stejná logika tak může pracovat s různými typy bez ručního přetypování přes `object`.

## 1. Princip :id=_1-koncept

Kompilátor kontroluje operace podle parametrů a jejich **omezení (constraints)** a do IL (Intermediate Language, mezikódu .NET) ukládá jedinou generickou definici s metadaty. Strojový kód vzniká až za běhu v JIT (Just-In-Time) kompilátoru: pro hodnotové typy obvykle vytvoří specializovanou verzi, referenční typy mohou sdílet jeden kód. Při předkompilaci AOT (Ahead-of-Time) rozhoduje o konkrétních verzích nástroj při publikaci. Podrobnosti viz [CLR](CLR_overview.md).

| Omezení | Co poskytuje |
|---|---|
|`where T : class`|Referenční typ; v zapnutém [nullable kontextu](Nullable.md) navíc bez `?`.|
|`where T : struct`|Nenulovatelný hodnotový typ; nikoli `Nullable<T>`.|
|`where T : new()`|Veřejný bezparametrový konstruktor a neabstraktní typ.|
|`where T : IComparable<T>`|Možnost volat příslušné porovnání.|
|`where T : BaseClass`|Základní třída nebo z ní odvozený typ.|
|`where T : notnull`|Nenulovatelný hodnotový nebo referenční typ; nesoulad vyvolává nullable diagnostiku.|

Generika neodstraňují veškerý boxing; například převod hodnoty na `object` jej může způsobit i uvnitř generické metody.

## 2. Příklad

### Generická metoda a třída

```csharp
static T[] Opakuj<T>(T hodnota, int pocet)
{
    ArgumentOutOfRangeException.ThrowIfNegative(pocet);
    T[] pole = new T[pocet];
    Array.Fill(pole, hodnota);
    return pole;
}
Console.WriteLine(string.Join(", ", Opakuj(42, 3)));
Console.WriteLine(string.Join(", ", Opakuj("ahoj", 2)));
Zasobnik<int> zasobnik = new();
zasobnik.Push(7);
Console.WriteLine(zasobnik.Pop());
class Zasobnik<T>
{
    private readonly Stack<T> _data = new();
    public void Push(T hodnota) => _data.Push(hodnota);
    public T Pop() => _data.Pop();
    public int Count => _data.Count;
}
```

Výstup: `42, 42, 42`, `ahoj, ahoj`, `7`. `Pop` prázdného zásobníku vyhodí `InvalidOperationException`. U referenčního `T` vloží `Array.Fill` opakovaně stejnou referenci, ne nezávislé kopie objektu.

### Omezení – práce s rozhraním

```csharp
static T Vetsi<T>(T a, T b) where T : IComparable<T> => a.CompareTo(b) >= 0 ? a : b;
Console.WriteLine(Vetsi(3, 7));
```

Výstup: `7`. Omezení zpřístupňuje `CompareTo`; bez něj nelze předpokládat, že libovolné `T` podporuje tuto metodu. U řetězců výsledek `CompareTo` závisí na pravidlech aktuální kultury, takže „abecední“ pořadí se může mezi prostředími lišit.

### Generické rozhraní a kovariance/kontravariance

```csharp
IEnumerable<string> jmena = new[] { "Anna", "Petr" };
IEnumerable<object> objekty = jmena;
Action<object> vypis = o => Console.WriteLine(o);
Action<string> vypisJmeno = vypis;
vypisJmeno(string.Join(", ", objekty));
```

Výstup: `Anna, Petr`. Kovariance (`out`) dovoluje toto rozšíření výsledného referenčního typu, kontravariance (`in`) opačné přizpůsobení vstupu. Platí pro odpovídající rozhraní/delegáty a referenční typy, nikoli například `IEnumerable<int> → IEnumerable<object>`. `List<string>` také nelze přiřadit do `List<object>`.

## 3. Kdy použít

Generika se hodí pro kolekce, opakovaně použitelné algoritmy a kontrakty služeb. Pokud je typ známý až za běhu, může být naopak namístě reflection; nejde o vždy vzájemně zaměnitelná řešení.

## 4. Časté chyby

- Příliš přísné `class` vyloučí hodnotové typy, i když by stačilo `notnull`.
- Omezení přidávejte podle skutečně potřebných operací; bez omezení jsou stále dostupné například členy zděděné z `object`.
- Každý uzavřený typ má vlastní statická pole: `Pocitadlo<int>` a `Pocitadlo<string>` nesdílejí čítač, i když runtime sdílí část strojového kódu.
