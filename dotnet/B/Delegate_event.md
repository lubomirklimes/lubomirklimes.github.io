# Delegáty a události (`delegate`, `event`)

**Příklady:** .NET 10 / C# 14, `dotnet new console -f net10.0`. Každý blok C# je samostatný `Program.cs` pro `dotnet run`, pokud není označen jiný kontext. Bloky nespojujte.

Delegát je typ, jehož hodnota odkazuje na jednu či více metod se shodným podpisem; zavoláním delegátu se zavolají tyto metody. Kompilátor hlídá, že podpis odpovídá. U metody instance si delegát pamatuje i cílový objekt. Událost poskytuje řízené přihlášení odběratelů k oznámení.

## 1. `Func<T>` a `Action<T>` – vestavěné delegáty

```csharp
Action<string> vypis = text => Console.WriteLine(text);
Func<int, int, int> soucet = (a, b) => a + b;
vypis("Ahoj!");
Console.WriteLine(soucet(3, 5));
```

Výstup: `Ahoj!` a `8`. `Action` nevrací hodnotu, poslední typový parametr `Func` je návratový typ.

## 2. Vlastní `delegate`

```csharp
static int Secti(int a, int b) => a + b;
static int Nasob(int a, int b) => a * b;
Operace operace = Secti;
Console.WriteLine(operace(3, 4));
operace = Nasob;
Console.WriteLine(operace(3, 4));
delegate int Operace(int a, int b);
```

Výstup: `7`, `12`. Deklarace typu delegátu je za příkazy nejvyšší úrovně; alternativou je explicitní `Main`.

## 3. Multicast – více metod v jednom delegátu

```csharp
Action pozdrav = () => Console.WriteLine("Ahoj!");
pozdrav += () => Console.WriteLine("Dobrý den!");
pozdrav();
```

Metody se volají synchronně v pořadí registrace. Neošetřená výjimka přeruší další volání. U delegátu s návratovou hodnotou běžné volání vrátí jen výsledek poslední metody, nikoli seznam výsledků; pro oznámení proto bývá vhodnější `void`.

## 4. Události (`event`)

U běžné události s automatickým úložištěm může vnější kód použít `+=` a `-=`, ale nemůže ji přímo vyvolat nebo přepsat celý seznam odběratelů.

```csharp
Budik budik = new();
Action reakce = () => Console.WriteLine("Vstávat!");
budik.Zazvoneni += reakce;
budik.Spust();
budik.Zazvoneni -= reakce;
budik.Spust();
class Budik
{
    public event Action? Zazvoneni;
    public void Spust()
    {
        Console.WriteLine("Tik tak…");
        Zazvoneni?.Invoke();
    }
}
```

Výstup: `Tik tak…`, `Vstávat!`, `Tik tak…`. Pro odhlášení uchovejte původní delegát; nově napsaná lambda není stejným odběrem. Dlouho žijící vydavatel drží přes běžný odběr referenci na odběratele.

## 5. `EventHandler<T>` – událost s daty

```csharp
Stahovani stahovani = new();
EventHandler<int> reakce = (_, procenta) => Console.WriteLine($"Staženo: {procenta}%");
stahovani.Prubeh += reakce;
stahovani.Stahuj();
stahovani.Prubeh -= reakce;
class Stahovani
{
    public event EventHandler<int>? Prubeh;
    public void Stahuj()
    {
        for (int i = 0; i <= 100; i += 25) Prubeh?.Invoke(this, i);
    }
}
```

Vypíše 0, 25, 50, 75 a 100 procent. `sender` je zde vydavatel; druhý parametr jsou data. Současné .NET dovoluje i `int`; pro bohatší veřejný kontrakt lze vytvořit vlastní typ dat události.

<details>
<summary>Volitelné podrobnosti: Životnost odběru</summary>

Odběr lze svázat s `IDisposable`, například takto:

```csharp
Budik budik = new();
using (var odber = new Odber(budik)) budik.Spust();
budik.Spust();
class Budik
{
    public event Action? Zazvoneni;
    public void Spust() => Zazvoneni?.Invoke();
}
sealed class Odber : IDisposable
{
    private readonly Budik _budik;
    public Odber(Budik budik) { _budik = budik; _budik.Zazvoneni += Reakce; }
    private void Reakce() => Console.WriteLine("Zazvonilo.");
    public void Dispose() => _budik.Zazvoneni -= Reakce;
}
```

Výstup: jediné `Zazvonilo.`. `event` samo nepřesouvá obsluhu do jiného vlákna a negarantuje asynchronní koordinaci; dlouhá obsluha blokuje vyvolávající kód.

</details>
