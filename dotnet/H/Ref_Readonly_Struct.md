# `ref struct` a `readonly struct` – výkonové struktury v .NET

`struct` je hodnotový typ: přiřazení a předání hodnotou kopíruje celá data. `readonly struct` zaručuje, že instance po konstrukci nemění svá pole, a umožní překladači vynechat obranné kopie. `ref struct` je typ, který se **nikdy nesmí dostat na haldu**; díky tomu smí obsahovat `Span<T>` a odkazy do paměti s omezenou životností.

**Prostředí:** .NET 10 / C# 14. U jednotlivých pravidel je uvedena verze jazyka, od které platí. Nejdůležitější `ref struct` je `Span<T>`: [Span a Memory](Span_Memory.md).

## 1. Princip :id=_1-koncept

### readonly struct

Všechna instanční pole musí být `readonly` a vlastnosti jen pro čtení (C# 7.2+). Neměnnost je **mělká**: pole typu `List<T>` nelze přepsat jiným seznamem, obsah seznamu ale měnit jde. Přínos pro výkon: volání členů přes `in` parametr nebo `readonly` pole nepotřebuje obrannou kopii.

### ref struct

`ref struct` (C# 7.2+) nelze boxovat, uložit do pole třídy nebo běžné struktury, zachytit v lambdě ani použít jako prvek pole. Kde leží data, na která odkazuje, je jiná otázka: `Span<byte>` může ukazovat na pole na haldě.

Pravidla se postupně uvolňují:

- **C# 11**: `ref struct` může mít `ref` pole (tak je implementován `Span<T>`).
- **C# 13**: lokální proměnné `ref struct` jsou povolené v `async` metodách a iterátorech, pokud jejich použití nepřekročí `await` nebo `yield`. `ref struct` smí implementovat rozhraní a být typovým argumentem s omezením `allows ref struct`.

## 2. Příklad

<span id="readonly-struct-immutabilní-hodnotový-typ"></span>

### readonly struct – neměnný hodnotový typ

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`; ukazuje i odmítnutí nulového vektoru.

```csharp
var a = new Vektor2(1, 0);
var b = new Vektor2(0, 2);
Console.WriteLine($"Úhel: {MathF.Round(Vektor2.UhelStupne(in a, in b))}°");
try { Vektor2.UhelStupne(in a, new Vektor2(0, 0)); }
catch (InvalidOperationException e) { Console.WriteLine(e.Message); }

public readonly struct Vektor2(float x, float y)
{
    public float X { get; } = x;
    public float Y { get; } = y;
    public float Delka => MathF.Sqrt(X * X + Y * Y);

    public static float Dot(in Vektor2 a, in Vektor2 b) => a.X * b.X + a.Y * b.Y;

    public Vektor2 Normalizovany()
    {
        float delka = Delka;
        if (delka == 0) throw new InvalidOperationException("Nulový vektor nelze normalizovat.");
        return new Vektor2(X / delka, Y / delka);
    }

    public static float UhelStupne(in Vektor2 a, in Vektor2 b)
    {
        // Zaokrouhlení může dát kosinus mírně nad 1; Acos by pak vrátil NaN.
        float cos = Math.Clamp(Dot(a.Normalizovany(), b.Normalizovany()), -1f, 1f);
        return MathF.Acos(cos) * 180f / MathF.PI;
    }
}
```

Výstup: `Úhel: 90°` a `Nulový vektor nelze normalizovat.` Pro výpočty ve skutečné aplikaci existuje `System.Numerics.Vector2` s hardwarovou akcelerací.

### ref struct – typ, který nesmí na haldu :id=ref-struct-stack-only-typ

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`; ukazuje i odmítnutí zápisu nad kapacitu.

```csharp
using System.Text;

Span<byte> pamet = stackalloc byte[16];
var zapisovac = new ZapisovacBajtu(pamet);
zapisovac.Zapis("Ahoj"u8);
zapisovac.Zapis(", svete"u8);
Console.WriteLine(Encoding.ASCII.GetString(zapisovac.Zapsano));
Console.WriteLine(zapisovac.ZkusZapsat("1234567890"u8) ? "Zapsáno." : "Nedostatek místa.");

public ref struct ZapisovacBajtu(Span<byte> cil)
{
    private readonly Span<byte> _cil = cil;
    private int _pozice;

    public readonly ReadOnlySpan<byte> Zapsano => _cil[.._pozice];

    public void Zapis(ReadOnlySpan<byte> data)
    {
        if (!ZkusZapsat(data)) throw new InvalidOperationException("Nedostatek místa.");
    }

    public bool ZkusZapsat(ReadOnlySpan<byte> data)
    {
        if (data.Length > _cil.Length - _pozice) return false; // Bez kontroly by CopyTo vyhodil výjimku.
        data.CopyTo(_cil[_pozice..]);
        _pozice += data.Length;
        return true;
    }
}
```

Výstup: `Ahoj, svete` a `Nedostatek místa.` Zapisovač je proměnlivý, proto jej předávejte `ref`, ne hodnotou: kopie by měla vlastní `_pozice`.

### Obranné kopie – proč readonly struct záleží

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`.

```csharp
var citac = new Citac();
Zvys(in citac);
Console.WriteLine(citac.Hodnota);

// Přes `in` nelze měnit původní hodnotu, proto se metoda zavolá na obranné kopii.
static void Zvys(in Citac c) => c.Zvys();

struct Citac
{
    public int Hodnota;
    public void Zvys() => Hodnota++;
}
```

Výstup: `0`. Kopie stojí čas a hlavně skrývá chybu: volání vypadá jako změna, ale nic nezmění. U `readonly struct` nebo členů označených `readonly` kopie nevzniká a změna stavu je chyba překladu.

### readonly ref struct (C# 7.2) :id=readonly-ref-struct-c-11

**Deklarace typu.**

```csharp
public readonly ref struct PohledNaData(ReadOnlySpan<byte> data)
{
    public ReadOnlySpan<byte> Data { get; } = data;
}
```

Kombinaci `readonly ref struct` jazyk podporuje od C# 7.2. Typ nesmí na haldu a nemění vlastní pole; data, na která ukazuje, ale může měnit jiný kód.

## 3. Kdy použít

- **`readonly struct`**: malé neměnné hodnoty (souřadnice, peněžní částka, identifikátor), zejména předávané přes `in` nebo uložené v `readonly` polích.
- **`ref struct`**: parsery, čtečky a zapisovače nad `Span<T>`, jejichž životnost končí s metodou.
- **`readonly ref struct`**: pohled na paměť bez změny stavu samotného pohledu.

## 4. Časté chyby

- **`ref struct` jako pole třídy**: chyba překladu. Pro data přes `await` nebo do pole třídy použijte `Memory<T>`.
- **Použití `ref struct` přes `await` nebo `yield`**: chyba i v C# 13; povolené je jen použití mezi nimi.
- **Proměnlivá struktura přes `in` nebo v `readonly` poli**: změny se provedou na kopii.
- **Mělká neměnnost**: `readonly struct` s polem `int[]` nebrání změně prvků.
- **Struktura podle „pravidla 16 B“ bez měření**: velká struktura kopírovaná hodnotou je drahá, ale vhodnost závisí na tom, jak se předává (`in`, `ref`) a ukládá.

---

<details>
<summary>Volitelné podrobnosti: in/ref/out, životnost a novinky C# 13</summary>

### in vs ref vs out

**Metoda s typem `Vektor2` z příkladu výše.**

```csharp
static void Secti(
    in  Vektor2 a,  // jen čtení přes referenci
    ref Vektor2 b,  // čtení i zápis
    out Vektor2 c)  // metoda musí přiřadit před návratem
{
    c = new Vektor2(a.X + b.X, a.Y + b.Y);
    b = c;
}
```

`in` šetří kopii jen u větších struktur a jen bez obranných kopií. U `int` nebo malé struktury je předání hodnotou stejně dobré a jednodušší. `ref readonly` parametr (C# 12) vyjádří totéž co `in`, ale vyžaduje, aby volající předal proměnnou.

### Kontrola životnosti a scoped :id=escape-analysis-a-stack-depth

Překladač u každého `ref struct` a `ref` hodnoty sleduje, z jakého rozsahu smí „uniknout“ (safe-to-escape). Proto nelze vrátit `Span` nad lokálním `stackalloc` ani jej uložit do delší životnosti. Klíčové slovo `scoped` (C# 11) u parametru slíbí, že metoda hodnotu nikam neuloží, a volající pak smí předat i pohled na lokální paměť. Jde o pravidla jazyka, ne o běhovou analýzu JIT.

### C# 13 – ref struct v generikách a rozhraních

**Samostatný `Program.cs`** v konzolovém projektu `net10.0` (C# 13+).

```csharp
Console.WriteLine(Zmer(new Okno("abc".AsSpan())));

// `allows ref struct` dovolí ref struct jako T; metoda proto nesmí T boxovat ani uložit na haldu.
static int Zmer<T>(T hodnota) where T : IMaDelku, allows ref struct => hodnota.Delka;

interface IMaDelku { int Delka { get; } }

ref struct Okno(ReadOnlySpan<char> data) : IMaDelku
{
    private readonly ReadOnlySpan<char> _data = data;
    public int Delka => _data.Length;
}
```

Výstup: `3`. Převést `Okno` na `IMaDelku` (boxování) nadále nelze; rozhraní slouží jen přes generické omezení.

### Kdy struct vs class

| Kritérium | struct | class |
|---|---|---|
| Sémantika | Hodnota, kopíruje se | Identita, sdílí se reference |
| Velikost | Spíše malá; velkou kopírovat drahé | Libovolná |
| Umístění | Kde je proměnná: zásobník, registr, uvnitř objektu na haldě | Objekt na haldě |
| Dědičnost | Ne, jen rozhraní | Ano |
| Boxování | Při převodu na `object` nebo rozhraní vznikne objekt na haldě | Nevzniká |

</details>
