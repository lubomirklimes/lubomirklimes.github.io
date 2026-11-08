# Práce se soubory a adresáři

**Příklady:** .NET 10 / C# 14. Samostatné bloky C# jsou jednotlivé náhrady `Program.cs` v projektu `dotnet new console -f net10.0`, spouštěné přes `dotnet run`. Bloky nespojujte; fragmenty a ukázky s dalšími požadavky jsou označené.

`File` poskytuje operace nad celým souborem, `Directory` nad adresáři a `Path` nad zápisem cest. Stream je proud bajtů, který lze zpracovávat postupně. Ukázky vytvářejí vlastní dočasný adresář a nakonec jej odstraní; nespouštějí se nad existujícími uživatelskými daty.

## Čtení a zápis souboru

**Samostatný příklad:** `WriteAllText` existující soubor přepíše; pro odmítnutí přepsání lze otevřít `FileStream` s `FileMode.CreateNew`.

```csharp
using System.Text;
string slozka = Directory.CreateTempSubdirectory("ukazka-").FullName;
try
{
    string cesta = Path.Combine(slozka, "pozdrav.txt");
    File.WriteAllText(cesta, "Ahoj, světe!", Encoding.UTF8);
    Console.WriteLine(File.ReadAllText(cesta, Encoding.UTF8));
    foreach (string radek in File.ReadAllLines(cesta, Encoding.UTF8))
        Console.WriteLine(radek);
}
finally { Directory.Delete(slozka, recursive: true); }
```

Výstup jsou dva řádky `Ahoj, světe!`. `ReadAllText` i `ReadAllLines` drží celý načtený obsah v paměti. Explicitní UTF-8 sjednocuje kontrakt; čtení libovolného souboru v jiném kódování vyžaduje jeho znalost.

## Přidání textu a práce s adresáři

```csharp
using System.Text;
string slozka = Directory.CreateTempSubdirectory("ukazka-").FullName;
try
{
    File.AppendAllText(Path.Combine(slozka, "log.txt"), "Nový záznam" + Environment.NewLine, Encoding.UTF8);
    Directory.CreateDirectory(Path.Combine(slozka, "data"));
    Console.WriteLine($"Textových souborů: {Directory.EnumerateFiles(slozka, "*.txt").Count()}");
}
finally { Directory.Delete(slozka, recursive: true); }
```

Výstup: `Textových souborů: 1`. Append přidává na konec, ale není řešením koordinace souběžných zapisovatelů. Kontrola `Exists` před otevřením není záruka: mezi kontrolou a operací se soubor může změnit. Ošetřujte konkrétní chybu samotné operace.

## Práce s cestami (`Path`)

```csharp
string cesta = Path.Combine("data", "soubor.txt");
Console.WriteLine(Path.GetFileName(cesta));
Console.WriteLine(Path.GetExtension(cesta));
Console.WriteLine(Path.GetDirectoryName(cesta));
```

Výstup: `soubor.txt`, `.txt`, `data`. Oddělovač v celé cestě závisí na OS. Relativní cesta se vyhodnocuje vůči pracovnímu adresáři procesu, ne automaticky vůči zdrojovému souboru. `Path.Combine` není validátor ani bezpečnostní kontrola uživatelského vstupu; absolutní další část může předchozí základ nahradit. Nedůvěryhodné cesty vyžadují vlastní kontrakt včetně pravidel pro odkazy souborového systému.

## Správné čtení velkých souborů po řádcích

**Samostatný malý testovací soubor** ukazuje stejný postup jako pro větší soubor:

```csharp
using System.Text;
string slozka = Directory.CreateTempSubdirectory("ukazka-").FullName;
try
{
    string cesta = Path.Combine(slozka, "radky.txt");
    File.WriteAllLines(cesta, new[] { "první", "druhý" }, Encoding.UTF8);
    using (var reader = new StreamReader(cesta, Encoding.UTF8))
    {
        string? radek;
        while ((radek = reader.ReadLine()) is not null) Console.WriteLine(radek);
    } // Čtečka se uzavře ještě před odstraněním adresáře, i při výjimce.
}
finally { Directory.Delete(slozka, recursive: true); }
```

Výstup: `první`, `druhý`. `using` uvolní vlastněný prostředek; neřeší automaticky chybu oprávnění ani neplatná data. I jediný extrémně dlouhý řádek potřebuje odpovídající paměť. `IOException` a `UnauthorizedAccessException` ošetřujte na vrstvě, která umí rozhodnout o nápravě; chybu bez reakce nepotlačujte.

<details>
<summary>Volitelné podrobnosti: FileStream a binární data</summary>

```csharp
string slozka = Directory.CreateTempSubdirectory("ukazka-").FullName;
try
{
    string cesta = Path.Combine(slozka, "data.bin");
    await using (var stream = new FileStream(cesta, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, useAsync: true))
        await stream.WriteAsync(new byte[] { 1, 2, 3 });
    Console.WriteLine(Convert.ToHexString(await File.ReadAllBytesAsync(cesta)));
}
finally { Directory.Delete(slozka, recursive: true); }
```

Výstup: `010203`. `await using` umožňuje asynchronní uvolnění; buffer a režim zvolte podle API a způsobu práce. Při čtení streamu nemusí jeden `ReadAsync` naplnit celý buffer; pro přesný počet zvažte `ReadExactlyAsync` nebo smyčku. Do dlouhých operací předávejte token zrušení.

</details>
