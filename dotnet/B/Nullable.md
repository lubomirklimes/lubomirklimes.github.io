# Referenční typy a null :id=nullable-reference-types

**Příklady:** .NET 10 / C# 14, `dotnet new console -f net10.0`. Každý blok C# je samostatný `Program.cs` pro `dotnet run`, pokud není označen jiný kontext. Bloky nespojujte.

Nullable reference types (NRT) jsou anotace a statická analýza možných `null` při kompilaci, dostupné od C# 8. Šablony nových projektů je obvykle zapínají. Kontrola probíhá jen při překladu: za běhu null nikdo automaticky nezakazuje.

## 1. Princip :id=_1-koncept

Anotace i varování zapíná tato položka uvnitř `PropertyGroup` v souboru projektu `.csproj`:

```xml
<Nullable>enable</Nullable>
```

| Zápis | Význam |
|---|---|
|`string`|Kontrakt nenulové reference v zapnutém kontextu. Kompilátor varuje při možném porušení.|
|`string?`|Reference může být null; před dereferencí je třeba prokázat nenulovost.|
|`vyraz!`|Potlačení nullable diagnostiky pro výraz; není to typ `string!` ani runtime kontrola.|

Analýza toku sleduje stav hodnoty v jednotlivých větvích. Anotace nevytváří jiný runtime typ řetězce. Naproti tomu `int?` je hodnotový `Nullable<int>`.

## 2. Příklad

### Základní použití

```csharp
string jmeno = "Pavel";
string? prijmeni = null;
Console.WriteLine($"Jméno: {jmeno}, délka příjmení: {prijmeni?.Length ?? 0}");
if (prijmeni is not null) Console.WriteLine(prijmeni.ToUpperInvariant());
```

Výstup: `Jméno: Pavel, délka příjmení: 0`. `?.` vynechá přístup u null, `??` poskytne náhradní hodnotu.

### Null-forgiving operátor `!`

Následující samostatný **negativní příklad** úmyslně zachytí výjimku: `!` neopravuje data.

```csharp
string? jmeno = null;
try { Console.WriteLine(jmeno!.Length); }
catch (NullReferenceException) { Console.WriteLine("Operátor ! neprovádí kontrolu za běhu."); }
```

Nepoužívejte `private readonly ... = null!` jako údajnou konstruktorovou injekci. Závislost musí někdo skutečně předat; příklad bez frameworku:

```csharp
using var zapis = new StringWriter();
Sluzba sluzba = new(zapis);
sluzba.Proved();
Console.Write(zapis.ToString());
class Sluzba
{
    private readonly TextWriter _zapis;
    public Sluzba(TextWriter zapis)
    {
        ArgumentNullException.ThrowIfNull(zapis);
        _zapis = zapis;
    }
    public void Proved() => _zapis.WriteLine("Provedeno.");
}
```

Výstup: `Provedeno.`. `!` má smysl jen s nezávisle platným důkazem či smluvenou inicializací, kterou analýza nevidí. [DI host](../C/DependencyInjection.md) může předávání zajistit kontejnerem.

### Anotace parametrů a návratových typů

`NotNullWhen(true)` vyjadřuje podmíněný kontrakt parametru. Implementace jej musí splnit na každé návratové cestě:

```csharp
using System.Diagnostics.CodeAnalysis;

static bool ZkusJmeno(string klic, [NotNullWhen(true)] out string? hodnota)
{
    hodnota = klic == "hlavni" ? "Pavel" : null;
    return hodnota is not null;
}
if (ZkusJmeno("hlavni", out string? jmeno)) Console.WriteLine(jmeno.Length);
Console.WriteLine(ZkusJmeno("jiny", out _) ? "Nalezeno" : "Nenalezeno");
```

Výstup: `5`, `Nenalezeno`. Prostý návratový typ `string?` by znamenal jen možnost null; nenulový `string` vyjadřuje nepodmíněný kontrakt.

### Migrace existujícího kódu

Zapněte nullable analýzu, upřesněte kontrakty, doplňte skutečné kontroly a opravujte varování po menších částech. Je-li dočasně nutné `#nullable disable warnings`, omezte úsek a obnovte stav přes `#nullable restore warnings`. Potlačení není oprava chyby. Pro vynucení všech varování projektu lze použít `dotnet build -warnaserror`; neurčuje pouze nullable kategorii.

## 3. Kdy použít

V nových projektech od začátku; u knihovny anotacemi zpřesněte veřejný kontrakt. Na vstupních hranicích stále validujte data podle skutečných požadavků, například prázdný řetězec není totéž jako null.

## 4. Časté chyby

- Spoléhání na anotaci jako na automatickou runtime ochranu.
- Plošné `null!` místo předání povinných závislostí.
- Deklarace `string?` „pro jistotu“, když kontrakt null nepotřebuje, nebo naopak slib `string`, který implementace nedodrží.
- Představa, že atribut sám kontroluje hodnotu: pouze informuje analýzu.
