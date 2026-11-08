# Výčtové typy (`enum`)

**Příklady:** .NET 10 / C# 14, `dotnet new console -f net10.0`. Každý blok C# je samostatný `Program.cs` pro `dotnet run`, pokud není označen jiný kontext. Bloky nespojujte.

`enum` přiřazuje jména celočíselným konstantám. Zvyšuje čitelnost, ale samo nezaručuje, že proměnná obsahuje jen pojmenovanou hodnotu.

## Základní použití

```csharp
Den dnes = Den.Patek;
Console.WriteLine(dnes);
Console.WriteLine((int)dnes);
enum Den { Pondeli, Utery, Streda, Ctvrtek, Patek, Sobota, Nedele }
```

Výstup obsahuje identifikátor `Patek` a číslo `4`. Bez explicitních hodnot začíná číslování nulou a pokračuje po jedné; výchozí podkladový typ je `int`.

Hodnoty lze stanovit explicitně:

```csharp
Console.WriteLine((int)StavObjednavky.Odeslana);
enum StavObjednavky { Nova = 1, Odeslana = 2, Dokoncena = 3, Zrusena = 4 }
```

Výstup: `2`. Výchozí hodnota tohoto typu je stále nula, i když pro ni není definováno jméno.

## Převody

```csharp
int cislo = (int)Den.Streda;
Den sobota = (Den)5;
Console.WriteLine($"{cislo}, {sobota}");
string vstup = "99";
if (Enum.TryParse(vstup, ignoreCase: true, out Den den) && Enum.IsDefined(den))
    Console.WriteLine(den);
else
    Console.WriteLine("Neplatný den.");
enum Den { Pondeli, Utery, Streda, Ctvrtek, Patek, Sobota, Nedele }
```

Výstup: `2, Sobota` a `Neplatný den.`. `TryParse` přijímá také číselný text a při `"99"` uspěje; pro tento nebitový enum je potřeba navíc `IsDefined`. Prostý cast čísel neprovádí kontrolu přípustnosti.

## Použití ve `switch`

```csharp
Den dnes = Den.Sobota;
switch (dnes)
{
    case Den.Sobota:
    case Den.Nedele: Console.WriteLine("Víkend!"); break;
    default: Console.WriteLine("Jiný den nebo nepojmenovaná hodnota."); break;
}
enum Den { Pondeli, Utery, Streda, Ctvrtek, Patek, Sobota, Nedele }
```

Výstup: `Víkend!`. Pro vstup od uživatele nejprve ověřte povolenou hodnotu.

<details>
<summary>Volitelné podrobnosti: Flags a kombinace bitů</summary>

Samostatné příznaky mají jednotlivé bity (1, 2, 4…), nula značí žádný a složené hodnoty kombinují více bitů. `[Flags]` podporuje tento význam a formátování, samotné bitové operace fungují i bez něj.

```csharp
Prava prava = Prava.Cteni | Prava.Zapis;
Console.WriteLine(prava);
Console.WriteLine(prava.HasFlag(Prava.Zapis) ? "Zápis povolen" : "Zápis zakázán");
Console.WriteLine((prava & ~Prava.Vse) == 0 ? "Známé bity" : "Neznámé bity");
[Flags]
enum Prava { Zadna = 0, Cteni = 1, Zapis = 2, Spusteni = 4, Vse = Cteni | Zapis | Spusteni }
```

Výstup: `Cteni, Zapis`, `Zápis povolen`, `Známé bity`. `IsDefined` není obecná kontrola bitové masky: platná kombinace nemusí mít vlastní pojmenovanou konstantu. `HasFlag(Prava.Zadna)` je vždy pravda, proto nulu testujte samostatně podle významu úlohy.

</details>
