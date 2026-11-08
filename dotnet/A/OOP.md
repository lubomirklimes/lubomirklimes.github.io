# Objektově orientované programování (OOP)

**Příklady:** .NET 10 / C# 14, `dotnet new console -f net10.0`. Každý blok C# je samostatný `Program.cs` pro `dotnet run`, pokud není označen jiný kontext. Bloky nespojujte.

Objekty spojují stav a operace nad ním. Zapouzdření řídí přístup ke stavu, rozhraní popisuje kontrakt a polymorfismus umožňuje stejné volání s různým chováním.

## 1. Třída a objekt

Třída definuje typ; `new` vytvoří jeho instanci. U příkazů nejvyšší úrovně musí být použití před deklaracemi typů:

```csharp
Auto mojeAuto = new();
mojeAuto.Znacka = "Škoda";
mojeAuto.RokVyroby = 2022;
mojeAuto.Start();

class Auto
{
    public string Znacka = "Neznámá";
    public int RokVyroby;
    public void Start() => Console.WriteLine($"{Znacka} startuje!");
}
```

Výstup: `Škoda startuje!`. `Auto` je referenční typ: přiřazení reference jiné proměnné nevytvoří druhé auto.

## 2. Konstruktor

Konstruktor nastaví počáteční stav a může odmítnout neplatný vstup:

```csharp
Auto auto = new("Škoda", 2022);
Console.WriteLine($"{auto.Znacka}, {auto.RokVyroby}");

class Auto
{
    public string Znacka { get; }
    public int RokVyroby { get; }
    public Auto(string znacka, int rok)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(znacka);
        if (rok < 1886) throw new ArgumentOutOfRangeException(nameof(rok));
        Znacka = znacka;
        RokVyroby = rok;
    }
}
```

Výstup: `Škoda, 2022`. Dolní mez roku je zvolené pravidlo ukázky, ne pravidlo jazyka.

## 3. Vlastnosti (Properties)

Vlastnost používá přístupové metody `get` a `set`; může vynucovat pravidla. Neplatnou změnu zde výslovně odmítne:

```csharp
Osoba osoba = new();
osoba.Vek = 20;
Console.WriteLine(osoba.Vek);

class Osoba
{
    private int _vek;
    public int Vek
    {
        get => _vek;
        set
        {
            if (value < 0) throw new ArgumentOutOfRangeException(nameof(value));
            _vek = value;
        }
    }
}
```

Výstup: `20`. Zjednodušená automatická vlastnost nepotřebuje ručně napsané pole:

```csharp
Osoba osoba = new() { Jmeno = "Anna" };
Console.WriteLine($"{osoba.Jmeno}, {osoba.Vek}");

class Osoba
{
    public string Jmeno { get; set; } = "Neznámá";
    public int Vek { get; private set; }
}
```

Výstup: `Anna, 0`. `private set` omezuje nastavení na samotnou třídu.

## 4. Dědičnost

Odvozená třída rozšiřuje základní typ; konstrukce „je druhem“ se liší od skládání objektů, kdy jeden objekt službu pouze obsahuje.

```csharp
Pes rex = new() { Jmeno = "Rex" };
rex.Zvuk();
rex.Stekej();

class Zvire
{
    public string Jmeno { get; set; } = "Neznámé";
    public void Zvuk() => Console.WriteLine($"{Jmeno} vydává zvuk.");
}
class Pes : Zvire
{
    public void Stekej() => Console.WriteLine($"{Jmeno} štěká!");
}
```

Výstup: `Rex vydává zvuk.` a `Rex štěká!`.

<details>
<summary>Volitelné podrobnosti: Virtuální přepis a rozhraní</summary>

`override` přepisuje metodu označenou `virtual` či `abstract`. Volání přes základní typ použije implementaci skutečného objektu:

```csharp
Zvire zvire = new Pes();
zvire.Zvuk();
class Zvire { public virtual void Zvuk() => Console.WriteLine("Zvíře vydává zvuk."); }
class Pes : Zvire { public override void Zvuk() => Console.WriteLine("Pes štěká!"); }
```

Rozhraní vyjadřuje kontrakt bez nutnosti společné základní třídy:

```csharp
IZvire zvire = new Kocka();
zvire.Zvuk();
interface IZvire { void Zvuk(); }
class Kocka : IZvire { public void Zvuk() => Console.WriteLine("Mňau!"); }
```

Výstupy: `Pes štěká!` a `Mňau!`. Rozhraní může v moderním C# obsahovat i jiné členy a výchozí implementace; jednoduchý kontrakt výše vyžaduje implementaci metody `Zvuk`.

</details>
