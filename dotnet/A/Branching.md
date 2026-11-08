# Podmínky a rozhodování

**Příklady:** .NET 10 / C# 14, `dotnet new console -f net10.0`. Každý blok C# je samostatný `Program.cs` pro `dotnet run`, pokud není označen jiný kontext. Bloky nespojujte.

Podmínka typu `bool` rozhoduje, která větev se provede. U řetězce `if / else if / else` se provede nejvýše jedna větev.

## 1. `if` / `else if` / `else`

Nejprve ověřte převod i celý povolený rozsah:

```csharp
Console.Write("Zadejte známku (1–5): ");
if (!int.TryParse(Console.ReadLine(), out int znamka) || znamka < 1 || znamka > 5)
{
    Console.WriteLine("Neplatná známka.");
    return;
}
if (znamka == 1)
    Console.WriteLine("Výborně!");
else if (znamka <= 3)
    Console.WriteLine("Obstojné.");
else
    Console.WriteLine("Je potřeba zlepšení.");
```

`1` vypíše `Výborně!`, `2` nebo `3` text `Obstojné.`. `0`, `-1`, `6`, text i konec vstupu jsou neplatné. Pouhá horní mez by zápornou známku přijala.

## 2. Logické operátory

| Operátor | Význam | Příklad |
|---|---|---|
|`&&`|Obě podmínky platí|`vek >= 13 && vek <= 19`|
|`\|\|`|Alespoň jedna platí|`vek < 6 \|\| vek > 65`|
|`!`|Negace|`!jeStudent`|

`&&` a `||` vyhodnocují pravou stranu jen tehdy, když je potřeba určit výsledek. Díky tomu nečteme `Length` u `null`:

```csharp
string? text = null;
Console.WriteLine(text != null && text.Length > 0 ? "Text vyplněn" : "Text chybí");
```

Výstup: `Text chybí`.

## 3. `switch` – více možností přehledně

```csharp
Console.Write("Zadejte číslo dne (1–7): ");
if (!int.TryParse(Console.ReadLine(), out int den))
{
    Console.WriteLine("Neplatné číslo.");
    return;
}
switch (den)
{
    case 1: Console.WriteLine("Pondělí"); break;
    case 2: Console.WriteLine("Úterý"); break;
    case 3: Console.WriteLine("Středa"); break;
    case 4: Console.WriteLine("Čtvrtek"); break;
    case 5: Console.WriteLine("Pátek"); break;
    case 6: Console.WriteLine("Sobota"); break;
    case 7: Console.WriteLine("Neděle"); break;
    default: Console.WriteLine("Neplatné číslo."); break;
}
```

`6` vypíše `Sobota`. `break` ukončí větev; `default` pokrývá čísla mimo 1–7.

<details>
<summary>Volitelné podrobnosti: Podmíněný operátor a switch výraz</summary>

Operátor `?:` vrací jednu ze dvou hodnot. `switch` výraz vybírá hodnotu podle vzoru; `_` je záchytný vzor. Samostatné příklady:

```csharp
int cislo = -2;
string vysledek = cislo > 0 ? "kladné" : "záporné nebo nula";
Console.WriteLine(vysledek);
```

```csharp
int den = 2;
string nazevDne = den switch
{
    1 => "Pondělí",
    2 => "Úterý",
    _ => "Jiný den"
};
Console.WriteLine(nazevDne);
```

Výstupy: `záporné nebo nula` a `Úterý`.

</details>
