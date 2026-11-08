# Iterátory a `yield return`

**Příklady:** .NET 10 / C# 14, `dotnet new console -f net10.0`. Každý blok C# je samostatný `Program.cs` pro `dotnet run`, pokud není označen jiný kontext. Bloky nespojujte.

Iterátor poskytuje prvky postupně. `yield return` předá jednu hodnotu, další posun enumerátoru (`MoveNext`) pokračuje za ním. Kompilátor zajistí stavový automat; neznamená to nulové alokace.

## 1. Princip :id=_1-koncept

Synchronní iterátor může vracet generické i negenerické `IEnumerable`/`IEnumerator`. Tělo s `yield` běží až při procházení. `yield break` procházení ukončí. `IEnumerable<T>` je kontrakt získání enumerátoru, ne slib uložené kolekce, levného opakování nebo souběžné bezpečnosti. Pro async proudy viz [IAsyncEnumerable](../H/IAsyncEnumerable.md).

## 2. Příklad

### Základní generátor

```csharp
using System.Numerics;
static IEnumerable<BigInteger> Fibonacciho(int pocet)
{
    ArgumentOutOfRangeException.ThrowIfNegative(pocet);
    return Generuj(pocet);
    static IEnumerable<BigInteger> Generuj(int pocet)
    {
        BigInteger a = 0, b = 1;
        for (int i = 0; i < pocet; i++)
        {
            yield return a;
            (a, b) = (b, a + b);
        }
    }
}
Console.WriteLine(string.Join(" ", Fibonacciho(8)));
```

Výstup: `0 1 1 2 3 5 8 13`. `BigInteger` zabraňuje přetečení pevného celočíselného typu, stále ale spotřebovává paměť. Vnější metoda nemá `yield`, takže záporný počet odmítne ihned, nikoli až při iteraci.

### Filtrace a transformace

```csharp
static IEnumerable<T> MujWhere<T>(IEnumerable<T> data, Func<T, bool> podminka)
{
    foreach (T prvek in data)
        if (podminka(prvek)) yield return prvek;
}
static IEnumerable<T> Stranka<T>(IEnumerable<T> data, int stranka, int velikost)
{
    ArgumentNullException.ThrowIfNull(data);
    ArgumentOutOfRangeException.ThrowIfNegative(stranka);
    ArgumentOutOfRangeException.ThrowIfNegativeOrZero(velikost);
    int preskocit = checked(stranka * velikost);
    return Generuj();
    IEnumerable<T> Generuj()
    {
        using var iterator = data.GetEnumerator();
        for (int i = 0; i < preskocit; i++) if (!iterator.MoveNext()) yield break;
        for (int i = 0; i < velikost && iterator.MoveNext(); i++) yield return iterator.Current;
    }
}
Console.WriteLine(string.Join(", ", MujWhere(new[] { 1, 2, 3, 4 }, n => n % 2 == 0)));
Console.WriteLine(string.Join(", ", Stranka(Enumerable.Range(1, 8), 1, 3)));
```

Výstup: `2, 4` a `4, 5, 6`. Stránky se číslují od nuly. `MujWhere` předpokládá nenulové argumenty; chyba uvnitř tohoto iterátoru nastane při procházení. Vlastní stránkování neznamená automatický databázový LIMIT; záleží na zdroji.

### Yield break pro podmíněné ukončení

```csharp
static IEnumerable<string> CtiRadkyDoKonce(TextReader reader, string sentinel)
{
    string? radek;
    while ((radek = reader.ReadLine()) is not null)
    {
        if (radek == sentinel) yield break;
        yield return radek;
    }
}
using var reader = new StringReader(string.Join(Environment.NewLine, "první", "STOP", "další"));
Console.WriteLine(string.Join(", ", CtiRadkyDoKonce(reader, "STOP")));
Console.WriteLine(reader.ReadLine());
```

Výstup: `první` a `další`. Značka STOP se spotřebuje, ale nevrátí. Čtečka je vypůjčená: vlastní a uvolňuje ji volající, nikoli iterátor.

<span id="kdy-lazy-hodnocení-ušetří-práci"></span>

### Kdy odložené vyhodnocení ušetří práci

```csharp
Produkt[] produkty = [new("A", 500), new("B", 1500), new("C", 2000)];
int navstiveno = 0;
var dotaz = produkty.Select(p => { navstiveno++; return p; }).Where(p => p.Cena > 1000);
Produkt? prvni = dotaz.FirstOrDefault();
Console.WriteLine($"První: {prvni?.Jmeno}, navštíveno: {navstiveno}");
navstiveno = 0;
var vsechny = dotaz.ToList();
Console.WriteLine($"Výsledků: {vsechny.Count}, navštíveno: {navstiveno}");
record Produkt(string Jmeno, int Cena);
```

Výstup: `První: B, navštíveno: 2`, potom `Výsledků: 2, navštíveno: 3`. Dotaz se provedl znovu; `ToList` z něj neudělá automatickou cache pro další použití původní proměnné `dotaz`.

## 3. Kdy použít

Pro postupné zpracování nebo zastavení po několika prvcích. Pro náhodný přístup či stabilní snímek výsledku jej vědomě materializujte například do pole. Některé sekvence nelze bez následků opakovat, zvlášť když čtou stavový stream.

## 4. Časté chyby

- Výjimka z těla iterátoru se může projevit až v konzumentovi; okamžité kontroly oddělte od těla iterátoru.
- `yield return` nelze v `try`, které má `catch`, ani v `catch`/`finally`. Je přípustné v `try` s pouhým `finally`; `using` je proto užitečný pro uvolnění zdroje.
- `foreach` enumerátor při ukončení včetně `break` uvolní; při ruční práci musí `Dispose` zajistit volající. Visící enumerátor může držet otevřený zdroj.
- Změna zdrojového běžného seznamu může zneplatnit enumeraci; nejde o univerzální chování všech typů kolekcí.
