# Porovnávání pomocí vzorů :id=pattern-matching

**Příklady:** .NET 10 / C# 14, `dotnet new console -f net10.0`. Každý blok C# je samostatný `Program.cs` pro `dotnet run`, pokud není označen jiný kontext. Bloky nespojujte.

Vzory (pattern matching) testují typ, hodnotu či strukturu dat a mohou pojmenovat nalezené části. Ukázky používají C# 14; `switch` výraz existuje od C# 8, relační/logické vzory od C# 9 a seznamové od C# 11.

## 1. Princip :id=_1-koncept

| Vzor | Příklad | Význam |
|---|---|---|
|Typový|`x is string s`|Test typu a přiřazení do `s`.|
|Vlastností|`x is { Jmeno: "Pavel" }`|Test vlastností nenulového objektu.|
|N-tice|`(x, y) is (0, 0)`|Kombinace hodnot.|
|Relační/logický|`x is > 0 and < 100`|Porovnání a skládání vzorů.|
|Seznamový|`x is [1, 2, ..]`|Délka a položky odpovídajícího zdroje.|

Úplnost větvení znamená, že je pokryt každý možný vstup. Kompilátor neúplný `switch` výraz hlásí varováním, ale podmínky `when` při této kontrole nevyhodnocuje: větev s `when` se nepočítá jako pokrytí. Bez shody může `switch` výraz za běhu vyhodit `SwitchExpressionException`.

## 2. Příklad

<span id="is-výraz-s-type-pattern"></span>

### Výraz is s typovým vzorem

```csharp
object obj = "ahoj";
if (obj is string text) Console.WriteLine(text.Length);
```

Výstup: `4`. Proměnnou lze použít tam, kde analýza ví, že vzor uspěl. Test typu u `null` neuspěje.

### Switch výraz (C# 8+)

```csharp
static string Popis(object? tvar) => tvar switch
{
    Kruh { Polomer: > 0 } k => $"Kruh r={k.Polomer}",
    Obdelnik r when r.Sirka == r.Vyska => $"Čtverec {r.Sirka}×{r.Vyska}",
    Obdelnik r => $"Obdélník {r.Sirka}×{r.Vyska}",
    null => "Chybějící tvar",
    _ => "Neznámý tvar"
};
Console.WriteLine(Popis(new Kruh(2)));
Console.WriteLine(Popis(new Obdelnik(3, 3)));
Console.WriteLine(Popis(null));
record Kruh(int Polomer);
record Obdelnik(int Sirka, int Vyska);
```

Výstup: `Kruh r=2`, `Čtverec 3×3`, `Chybějící tvar`. `when` je dodatečná podmínka; toto je klasifikace, nikoli úplná geometrická validace.

<span id="property-pattern-a-relační-vzory"></span>

### Vzor vlastností a relační vzory

```csharp
static bool JeValidni(Uzivatel? u) => u is { Jmeno: { Length: > 0 }, Vek: >= 18, Email: not null };
static string Teplota(double t) => t switch
{
    < 0 => "Mráz",
    >= 0 and < 20 => "Chladno",
    >= 20 and < 30 => "Příjemně",
    >= 30 => "Horko",
    _ => "Neznámé"
};
Console.WriteLine(JeValidni(null) ? "Platný" : "Neplatný");
Console.WriteLine(Teplota(double.NaN));
record Uzivatel(string? Jmeno, int Vek, string? Email);
```

Výstup: `Neplatný`, `Neznámé`. Vzor vlastností nesedí na null. Nenulový e-mail ještě nemusí být platnou adresou; mezery ve jméně zde také nejsou odmítnuty. `NaN` nesplňuje uvedené relační větve.

<span id="tuple-pattern-pro-stavový-automat"></span>

### Vzor n-tice pro stavový automat

```csharp
static Stav Dalsi(Stav stav, Vstup vstup) => (stav, vstup) switch
{
    (Stav.Neaktivni, Vstup.Start) => Stav.Bezici,
    (Stav.Bezici, Vstup.Pauza) => Stav.Pozastaveno,
    (Stav.Pozastaveno, Vstup.Start) => Stav.Bezici,
    (_, Vstup.Stop) => Stav.Neaktivni,
    _ => stav
};
Console.WriteLine(Dalsi(Stav.Neaktivni, Vstup.Start));
enum Stav { Neaktivni, Bezici, Pozastaveno }
enum Vstup { Start, Pauza, Stop }
```

Výstup je identifikátor `Bezici`. Ostatní kombinace zachovají stav; u externího vstupu je nutné zvážit i nepojmenované hodnoty enumu.

### Seznamové vzory (C# 11) :id=list-pattern-c-11

```csharp
static bool JePrazdny(int[]? data) => data is [];
static bool MaJedenPrvek(int[]? data) => data is [_];
static bool ZacinaNulou(int[]? data) => data is [0, ..];
static bool MaTriPrvky(int[]? data) => data is [_, _, _];
Console.WriteLine(JePrazdny([]) && MaJedenPrvek([5]) && ZacinaNulou([0, 2]) && MaTriPrvky([1, 2, 3]) ? "Vzory odpovídají" : "Neshoda");
Console.WriteLine(JePrazdny(null) ? "Prázdné" : "Null není prázdné pole");
```

## 3. Kdy použít

Pro klasifikaci podtypů, kontrolu tvaru zpráv a malé stavové automaty. Zpracování několika podtypů samo nevytváří uzavřenou algebraickou unii: do systému mohou přibýt nové typy, které má pokrýt zvolená politika.

## 4. Časté chyby

Obecný vzor před konkrétním může další větev znepřístupnit. Záchytnou větev navrhněte podle kontraktu, ne jako slepé zamaskování chyby. Čitelnost závisí hlavně na složitosti jednotlivých podmínek.
