# CLR, sestavení a přehled runtime

**Příklady:** .NET 10 / C# 14, `dotnet new console -f net10.0`. Každý blok C# je samostatný `Program.cs` pro `dotnet run`, pokud není označen jiný kontext. Bloky nespojujte.

C# je jazyk, .NET runtime zajišťuje běh aplikace: načítá přeložený kód, nechává jej převést na strojové instrukce procesoru a spravuje paměť. Převod probíhá buď za běhu v JIT (Just-In-Time) kompilátoru, nebo předem při publikaci v režimu AOT (Ahead-of-Time); volba závisí na aplikaci a cílové platformě.

## 1. Princip :id=_1-koncept

### Common Language Runtime (CLR)

CLR je běhové prostředí spravovaného kódu. Poskytuje systém typů, obsluhu výjimek, načítání kódu a správu paměti přes garbage collector (GC). Běžný CoreCLR používá také JIT kompilátor. Jazyková typová bezpečnost není bezpečnostní sandbox: `unsafe`, nativní knihovny i samotné API aplikace mohou vykonávat privilegované operace. Historické Code Access Security z .NET Framework není bezpečnostní model moderního .NET.

### IL a sestavení (Assembly)

Běžné sestavení přes Roslyn vytváří IL (Intermediate Language) a metadata typů, metod a atributů. Manifest obsahuje identitu a závislosti sestavení; reflection tato metadata čte. Ne každý `.exe` je spravované sestavení: může jít například o nativní spouštěč aplikace.

```text
Zdroj C# → kompilátor Roslyn → IL a metadata → JIT → nativní instrukce
                                           ↘ Native AOT při publikaci
```

Source generator běží během kompilace: čte zdrojový kód projektu a přidává k němu nové zdrojové soubory. Existující kód ani hotové IL nepřepisuje.

### AssemblyLoadContext

`AssemblyLoadContext` (ALC), dostupný od .NET Core, řídí načítání a oddělení identit sestavení. Různé kontexty mohou používat různé verze knihovny se stejným názvem. Typ se stejným jménem z jiného kontextu ale nemusí být přiřaditelný ke zdánlivě stejnému typu hostitele; sdílené kontrakty je nutné načítat záměrně.

ALC **není bezpečnostní izolace** ani náhrada odděleného procesu pro nedůvěryhodný plugin. Moderní .NET nepodporuje vytváření dalších AppDomain pro někdejší model izolace .NET Framework. Unload uvolnitelného kontextu je kooperativní a závisí na zániku všech relevantních referencí; neznamená okamžité uvolnění paměti ani automatický hot reload.

### JIT vs AOT

| JIT | Native AOT |
|---|---|
|Překlad metod za běhu; může existovat více optimalizačních úrovní.|Překlad při publikaci, bez JIT pro aplikační kód.|
|Umožňuje dynamické generování kódu v podporovaných prostředích.|Dynamické načítání/generování a některá reflection API jsou omezená; potřebná metadata musí být zachována.|
|První použití může zahrnovat kompilaci.|Často zlepší start; velikost a výkon závisí na aplikaci a publikaci.|

Která varianta vyjde menší či rychlejší, závisí na konkrétní aplikaci; ověřte to měřením. ReadyToRun je další možnost kombinující předpřipravený kód s JIT. Podrobnosti: [JIT/AOT](../H/JIT_AOT.md).

<span id="gc-přehled"></span>

### Přehled GC

GC zjišťuje dosažitelnost objektů od kořenů (například živých referencí a statických polí), nikoli prosté počítání referencí. Objekty na spravované haldě běžně procházejí generacemi 0/1/2 podle přežitých sběrů; nejsou tím zaručeny okamžiky sběru. Objekty o velikosti **od 85 000 bajtů včetně režie** se standardně ukládají na LOH (Large Object Heap, haldu velkých objektů); hranici lze v konfiguraci runtime změnit. LOH se sbírá spolu s generací 2. GC nenahrazuje `Dispose` pro deterministické uvolnění zdrojů; viz [správa paměti](../H/Sprava_pameti.md).

## 2. Příklad

### Reflection – přístup k metadatům za běhu

```csharp
using System.Reflection;
Assembly assembly = Assembly.GetExecutingAssembly();
Console.WriteLine($"Název sestavení: {assembly.GetName().Name}");
Console.WriteLine($"Verze: {assembly.GetName().Version}");
Type typ = typeof(Sluzba);
object instance = Activator.CreateInstance(typ) ?? throw new InvalidOperationException("Instanci nelze vytvořit.");
MethodInfo metoda = typ.GetMethod(nameof(Sluzba.SpustiAsync)) ?? throw new MissingMethodException();
await (Task)(metoda.Invoke(instance, null) ?? throw new InvalidOperationException("Chybí úloha."));
public class Sluzba
{
    public Task SpustiAsync() { Console.WriteLine("Služba spuštěna."); return Task.CompletedTask; }
}
```

Výpis obsahuje metadata aktuálního projektu a `Služba spuštěna.`. Jméno/verze závisejí na sestavení. Jde o běžný JIT projekt; publikace s trimmingem či Native AOT vyžaduje samostatné ověření zachovaných metadat. Výjimky volané metody může reflection zabalit do `TargetInvocationException`.

### AssemblyLoadContext pro pluginy

**Fragment** do metody hostitelské aplikace (běžící s JIT, ne Native AOT) s `using System.Runtime.Loader;`. Nejde o samostatný program: vyžaduje existující absolutní cestu k důvěryhodnému pluginu, řešení jeho závislostí a smluvený sdílený kontrakt; samotná ukázka takový plugin nedodává.

```csharp
string cesta = Path.GetFullPath("plugins/MujPlugin.dll");
var context = new AssemblyLoadContext("Plugin", isCollectible: true);
try
{
    var plugin = context.LoadFromAssemblyPath(cesta);
    Console.WriteLine(plugin.GetName().Name);
}
finally
{
    context.Unload(); // Žádost o uvolnění, ne důkaz jeho dokončení.
}
```

I po návratu musí zaniknout reference na typy, instance, delegáty a případná běžící vlákna pluginu. Odolný plugin systém řeší resolver závislostí a životní cyklus; tento fragment není jeho kompletní implementací.

### Zjištění runtime informací

```csharp
using System.Runtime.InteropServices;
Console.WriteLine(RuntimeInformation.FrameworkDescription);
Console.WriteLine(RuntimeInformation.OSDescription);
Console.WriteLine(RuntimeInformation.ProcessArchitecture);
Console.WriteLine($"Dostupné logické procesory: {Environment.ProcessorCount}");
```

Hodnoty závisí na stroji, omezeních procesu i instalovaném runtime; `ProcessorCount` není nutně počet fyzických jader.

## 3. Kdy je znalost CLR důležitá

Při diagnostice alokací/startu, navrhování pluginů, komunikaci s nativním kódem a publikaci s trimmingem/AOT. Roslyn a source generators řeší zdrojovou kompilaci; nejsou synonymem běhového CLR.

## 4. Časté chyby

- ALC či typová bezpečnost neizolují nedůvěryhodný kód od oprávnění procesu.
- `Unload()` nezaručuje okamžité odstranění všech souvisejících objektů.
- Výkon reflection a JIT zahřívání závisí na scénáři; měřte odpovídající studený start nebo ustálený stav. Obecně platný násobek zpomalení neexistuje.
