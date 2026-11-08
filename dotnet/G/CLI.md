# .NET CLI a System.CommandLine

CLI je rozhraní příkazové řádky. Nástroj `dotnet` spravuje .NET projekty, knihovna System.CommandLine pomáhá vytvořit vlastní příkazy, argumenty a nápovědu. Příklady cílí na .NET 10 / C# 14; Ukázky používají stabilní API řady **System.CommandLine 2.0.x**.

## 1. Princip :id=_1-koncept

Parametry jsou vstup, který musí být zkontrolován. Výsledek sdělujte návratovým kódem: nula znamená úspěch, nenulový kód konkrétní neúspěch podle kontraktu nástroje. Běžný výstup patří na stdout, diagnostika na stderr. Před otevřením souboru samotná kontrola Exists neodstraňuje souběžné změny.

## 2. Příklad

<span id="nejčastější-dotnet-příkazy"></span>

### Běžné příkazy dotnet

Vlastní projekt lze vytvořit přes `dotnet new console -f net10.0`, sestavit přes `dotnet build`, spustit `dotnet run` a publikovat `dotnet publish`. U více projektů uveďte skutečnou cestu. Testy musejí existovat; úspěšné sestavení není důkazem jejich provedení.

Týmové nástroje lze připnout do místního manifestu (`dotnet new tool-manifest`, potom instalace zvolené verze nástroje a `dotnet tool restore`). Globální instalace není podmínkou. EF migrace navíc potřebují projekt, provider, Design balíček a odpovídající dotnet-ef; samotný příkaz nevytvoří bezpečný produkční migrační plán.

<span id="systemcommandline-jednoduchý-cli-nástroj"></span>

### System.CommandLine – převod malého UTF-8 souboru

**Celý `Program.cs`** v konzolovém projektu s balíčkem `System.CommandLine` řady 2.0.x. Přidání: `dotnet add package System.CommandLine --version 2.0.*`. Starší návody z doby beta verzí používají `SetHandler` a `AddOption`; stabilní API je nahradilo metodou `SetAction` a kolekcí `Options`.

```csharp
using System.CommandLine;
using System.Text;
var input = new Option<FileInfo>("--input") { Description = "Vstupní UTF-8 soubor", Required = true };
var output = new Option<FileInfo>("--output") { Description = "Nový výstupní soubor", Required = true };
var root = new RootCommand("Převod malého textu na velká písmena");
root.Options.Add(input);
root.Options.Add(output);
root.SetAction(async (parse, ct) =>
{
    var zdroj = parse.GetValue(input) ?? throw new InvalidOperationException("Chybí vstup.");
    var cil = parse.GetValue(output) ?? throw new InvalidOperationException("Chybí výstup.");
    try
    {
        if (zdroj.Length > 1024 * 1024) throw new InvalidDataException("Vstup je příliš velký.");
        string text = new UTF8Encoding(false, true).GetString(await File.ReadAllBytesAsync(zdroj.FullName, ct));
        await using var stream = new FileStream(cil.FullName, new FileStreamOptions
        { Mode = FileMode.CreateNew, Access = FileAccess.Write, Share = FileShare.None, Options = FileOptions.Asynchronous });
        await using var writer = new StreamWriter(stream, new UTF8Encoding(false));
        await writer.WriteAsync(text.ToUpperInvariant().AsMemory(), ct);
        Console.WriteLine("Soubor byl převeden.");
        return 0;
    }
    catch (OperationCanceledException) { Console.Error.WriteLine("Operace byla zrušena."); return 130; }
    catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or DecoderFallbackException)
    {
        Console.Error.WriteLine("Vstup nelze načíst nebo nový výstup nelze vytvořit.");
        return 1;
    }
});
return await root.Parse(args).InvokeAsync();
```

Spuštění v adresáři projektu: `dotnet run -- --input vstup.txt --output vystup.txt`; pro obsah `Ahoj` vznikne `AHOJ`, návratový kód 0. Již existující výstup zůstane díky CreateNew zachován. Neplatné UTF-8 se odmítá, při selhání zápisu může zůstat částečný nově vytvořený výstup; následná automatizace musí kontrolovat exit code. Kód 130 při zrušení (Ctrl+C) přebírá konvenci shellů: 128 + číslo signálu SIGINT (2).

Limit je kontrola délky před čtením, nikoli průběžný limit proti cizímu měnícímu se souboru. Příklad patří pro malé místní soubory. Popisy voleb jsou české, vestavěné diagnostiky/nápověda knihovny mají vlastní lokalizaci. [System.CommandLine](https://learn.microsoft.com/en-us/dotnet/standard/commandline/get-started-tutorial).

### Podpříkazy :id=subcommands

**Alternativní celý `Program.cs`** se stejným balíčkem; nespojujte jej s převodníkem.

```csharp
using System.CommandLine;
var root = new RootCommand("Místní ukázkový nástroj");
var stav = new Command("stav", "Zobrazí stav ukázky");
stav.SetAction(_ =>
{
    Console.WriteLine("Žádné nasazení neprobíhá.");
    return 0;
});
root.Subcommands.Add(stav);
return root.Parse(args).Invoke();
```

`dotnet run -- stav` vrací 0 a uvedený text; neznámý příkaz je chyba parseru. Povinné volby i chyby otestujte, ne pouze úspěšnou větev.

## 3. Kdy použít

System.CommandLine se hodí pro více voleb a podpříkazů; několik jednoduchých argumentů lze zpracovat i bez balíčku. Ruční editace csproj je platná alternativa ke CLI, pokud rozumíte závislostem a kontrolujete výsledek. Verze beta ukázek a stabilního API nemíchejte.

## 4. Časté chyby

- Ignorovat exit code a považovat existenci částečného souboru za úspěch.
- Bez dohody přepsat výstup nebo spojit vstup/výstup na tutéž cestu; CreateNew výše přepsání nepovolí.
- Volat Environment.Exit uprostřed operace, čímž se obchází běžné dokončení a finally; vraťte kód přes Main/top-level return.
- Použít async void pro I/O handler. Asynchronní akce má vracet Task a respektovat předaný token.
