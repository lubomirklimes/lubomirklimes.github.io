# Práce s datem a časem

**Příklady:** .NET 10 / C# 14. Samostatné bloky C# jsou jednotlivé náhrady `Program.cs` v projektu `dotnet new console -f net10.0`, spouštěné přes `dotnet run`. Bloky nespojujte; fragmenty a ukázky s dalšími požadavky jsou označené.

Rozlišujte kalendářní datum, místní čas a konkrétní okamžik. `DateTime.Kind` označuje UTC, místní nebo neurčený čas, ale neobsahuje identifikátor libovolné zóny.

## Základní práce s `DateTime`

```csharp
DateTime ted = DateTime.Now;
DateTime dnes = DateTime.Today;
DateTime utc = DateTime.UtcNow;
Console.WriteLine($"Místní Kind: {ted.Kind}, UTC Kind: {utc.Kind}");
Console.WriteLine(dnes.TimeOfDay == TimeSpan.Zero ? "Dnes o půlnoci" : "Jiný čas");
```

Výstup: `Místní Kind: Local, UTC Kind: Utc`, `Dnes o půlnoci`. Konkrétní aktuální datum nelze uvádět jako pevný očekávaný výstup. Pro běžný přenos okamžiku je vhodný `DateTimeOffset` nebo jednoznačně určené UTC.

## Vytvoření data

```csharp
DateTime datum = new(2000, 6, 15);
DateTime okamzik = new(2000, 6, 15, 9, 30, 0, DateTimeKind.Utc);
Console.WriteLine(datum.Kind);
Console.WriteLine(okamzik.ToString("O", System.Globalization.CultureInfo.InvariantCulture));
```

Výstup: `Unspecified`, `2000-06-15T09:30:00.0000000Z`. Neplatný den v měsíci vyvolá `ArgumentOutOfRangeException`. Pouhé nastavení Kind není převodem mezi časovými zónami.

## Aritmetika s daty :id=aritmetika-s-datumy

```csharp
DateOnly datum = new(2024, 1, 31);
Console.WriteLine(datum.AddMonths(1).ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture));
DateTimeOffset zacatek = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
Console.WriteLine($"Minut: {(zacatek.AddMinutes(90) - zacatek).TotalMinutes}");
```

Výstup: `2024-02-29`, `Minut: 90`. `AddMonths` při kratším měsíci upraví den na poslední platný; nejde o přičtení pevného počtu dní. Rozdíl dvou místních `DateTime` není obecně skutečná uplynulá doba přes změnu letního času. Pro délku běžící operace použijte `Stopwatch`, ne změny nástěnných hodin.

## Formátování

```csharp
using System.Globalization;
DateTime dt = new(2025, 6, 15, 14, 30, 0);
Console.WriteLine(dt.ToString("dd.MM.yyyy HH:mm", CultureInfo.InvariantCulture));
Console.WriteLine(dt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
```

Výstup: `15.06.2025 14:30`, `2025-06-15`. Krátké formáty `d` a `t` bez výslovné kultury závisejí na prostředí. Pro strojový přenos okamžiku použijte vhodný formát, například `O`, a jednoznačný offset; ztrátové formátování pouze data okamžik nezachová.

## Parsování textu na datum

```csharp
using System.Globalization;
foreach (string text in new[] { "2025-06-15", "2025-02-30" })
{
    if (DateOnly.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var datum))
        Console.WriteLine("Platné: " + datum.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
    else Console.WriteLine("Neplatné datum.");
}
```

Výstup: `Platné: 2025-06-15`, `Neplatné datum.`. Volné `Parse` může přijmout jiné zápisy podle kultury. Na hranici API stanovte formát, pravidla mezer i zacházení s chybějícím offsetem.

<details>
<summary>Volitelné podrobnosti: DateOnly, TimeOnly a časové zóny</summary>

`DateOnly` a `TimeOnly` (od .NET 6) vyjadřují datum a denní čas bez zóny. `DateTimeOffset` nese datum, čas a posun vůči UTC, nikoli pravidla zóny ani její budoucí přechody. Pro ně slouží `TimeZoneInfo`.

```csharp
using System.Globalization;
DateTimeOffset utc = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
DateTimeOffset posunuty = utc.ToOffset(TimeSpan.FromHours(2));
Console.WriteLine(posunuty.ToString("yyyy-MM-dd HH:mm zzz", CultureInfo.InvariantCulture));
Console.WriteLine(utc == posunuty ? "Stejný okamžik" : "Jiný okamžik");
var zona = TimeZoneInfo.CreateCustomTimeZone("Ukazka", TimeSpan.FromHours(2), "Ukázka", "Ukázka");
Console.WriteLine(TimeZoneInfo.ConvertTime(utc, zona).Hour);
```

Výstup: `2026-01-01 14:00 +02:00`, `Stejný okamžik`, `14`. Vlastní pevná zóna zajišťuje, že příklad dá stejný výsledek na každém systému. Reálné systémové identifikátory a data zón závisejí na OS/ICU a jejich aktualizacích. Při převodu místního času ověřte `IsInvalidTime`/`IsAmbiguousTime` a určete politiku pro neexistující či dvojznačnou hodinu. `ToLocalTime` použije zónu stroje, nikoli automaticky zónu uživatele.

</details>
