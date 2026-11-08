# Funkce a metody

Metoda je pojmenovaný postup, který lze opakovaně volat. Parametry přijímají vstup a návratová hodnota předává výsledek volajícímu.

**Příklady:** .NET 10 / C# 14, `dotnet new console -f net10.0`. Každý blok C# je samostatný `Program.cs` pro `dotnet run`, pokud není označen jiný kontext. Bloky nespojujte. První příklady používají lokální funkce uvnitř implicitní vstupní metody programu.

## 1. Základní metoda

```csharp
void Pozdrav()
{
    Console.WriteLine("Ahoj!");
}

Pozdrav();
Pozdrav();
```

`void` znamená, že funkce nevrací hodnotu. Definice se neprovede sama: dvě volání vypíší dvakrát `Ahoj!`.

## 2. Metoda s parametry

```csharp
void Pozdrav(string jmeno)
{
    Console.WriteLine($"Ahoj, {jmeno}!");
}

Pozdrav("Petr");
Pozdrav("Anna");
```

`jmeno` je parametr typu `string`; `"Petr"` je argument předaný při volání. Výstup je `Ahoj, Petr!` a `Ahoj, Anna!`.

## 3. Metoda s návratovou hodnotou

```csharp
int Secti(int a, int b)
{
    return a + b;
}

int vysledek = Secti(5, 3);
Console.WriteLine($"Součet: {vysledek}");
```

Typ `int` před názvem určuje návratový typ. `return` ukončí volání a vrátí hodnotu; výstup je `Součet: 8`.

<span id="_4-lambda-výraz-zkrácený-zápis"></span>

## 4. Výrazové tělo a lambda

```csharp
int Secti(int a, int b) => a + b;
Func<int, int, int> soucet = (a, b) => a + b;

Console.WriteLine(Secti(4, 6));
Console.WriteLine(soucet(4, 6));
```

Pojmenovaná funkce `Secti` má **výrazové tělo**. Lambda `(a, b) => a + b` je anonymní funkce, zde uložená do delegátu `Func<int, int, int>` (dva vstupy a výsledek typu `int`). Delegát je proměnná, do které lze uložit funkci; podrobněji ho vysvětluje kapitola [Delegáty a události](../B/Delegate_event.md). Oba řádky vypíší `10`; samotný symbol `=>` neznamená vždy lambdu.

<details>
<summary>Volitelné podrobnosti: Přetížení metod</summary>

Přetížené metody mají stejný název a různé seznamy parametrů. Samotný návratový typ je nerozliší. Kompilátor vybírá použitelnou variantu podle argumentů a pravidel převodů; nejednoznačné volání odmítne.

```csharp
class Program
{
    static void Main()
    {
        Pozdrav();
        Pozdrav("Petr");
    }

    static void Pozdrav() => Console.WriteLine("Ahoj, neznámý!");
    static void Pozdrav(string jmeno) => Console.WriteLine($"Ahoj, {jmeno}!");
}
```

Zde jde o metody třídy s explicitním `Main`, protože lokální funkce nelze takto přetěžovat. Výstup je `Ahoj, neznámý!` a `Ahoj, Petr!`.

</details>

<details>
<summary>Volitelné podrobnosti: Rekurze</summary>

Rekurze je volání funkce ze sebe samé. Potřebuje základní případ a postup k němu; pro velkou hloubku může vyčerpat zásobník.

```csharp
int Faktorial(int n)
{
    // Rozsah chrání výsledek typu int před přetečením.
    if (n < 0 || n > 12) throw new ArgumentOutOfRangeException(nameof(n));
    return n <= 1 ? 1 : n * Faktorial(n - 1);
}

Console.WriteLine(Faktorial(5));
```

Výstup je `120`; pro `0` vrací funkce `1`.

</details>
