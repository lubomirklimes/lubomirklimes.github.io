# JIT (Just-In-Time) vs AOT (Ahead-Of-Time) kompilace v .NET

C# se při buildu překládá do IL (Intermediate Language). Nativní strojový kód z IL vzniká buď za běhu (JIT), nebo předem při publikaci (AOT). Volba ovlivňuje dobu startu, výkon po zahřátí, paměť, velikost výstupu a to, které funkce runtime lze použít. Žádný z režimů nevyhrává ve všech těchto ohledech.

**Prostředí:** .NET 10 / C# 14. Native AOT a ReadyToRun se publikují pro konkrétní RID (Runtime Identifier, např. `linux-x64`); podporované platformy a omezení se mezi verzemi .NET mění.

## 1. Princip :id=_1-koncept

### JIT (Just-In-Time)

JIT překládá metodu při jejím prvním volání. Díky **vrstvené kompilaci** (tiered compilation) nejprve vznikne rychle přeložený, méně optimalizovaný kód. Často volané metody a smyčky runtime později přeloží znovu s plnou optimalizací; od .NET 8 je výchozí i dynamická PGO (optimalizace podle profilu za běhu). Metoda se tedy může překládat víckrát a výkon se ustálí až po zahřátí.

JIT zná skutečný procesor a chování programu, takže může využít konkrétní instrukční sady, devirtualizovat často volaný typ nebo upřednostnit horkou větev.

### AOT (Ahead-Of-Time)

V .NET jsou dvě běžné formy předkompilace:

| Forma | Co vznikne | Za běhu |
|---|---|---|
| **ReadyToRun (R2R)** | IL sestavení doplněná o předem přeložený kód | JIT zůstává; horké metody může přeložit znovu, chybějící doplní |
| **Native AOT** | Jeden nativní spustitelný soubor pro daný RID | Bez JIT; runtime (GC, typový systém) je přilinkován do souboru |

Native AOT aplikace nepotřebuje na cílovém stroji instalovaný .NET, runtime ale obsahuje. Za běhu nevzniká nový strojový kód, proto nefungují funkce závislé na generování kódu.

## 2. Příklad

<span id="publikování-jako-nativeaot"></span>

### Publikování jako Native AOT

**Vlastnosti projektu a publikace; vyžaduje nativní toolchain (na Windows C++ build tools, na Linuxu clang a vývojové knihovny).** Publikujte na stejném OS, pro který výstup vzniká.

```xml
<PropertyGroup>
  <PublishAot>true</PublishAot>
  <OptimizationPreference>Speed</OptimizationPreference>
</PropertyGroup>
```

```bash
dotnet publish -c Release -r linux-x64
```

Už s `PublishAot` hlásí build analyzátory varování AOT a trimmingu. Výsledek otestujte jako publikovaný soubor; `dotnet run` stále používá JIT.

Kód, který má fungovat v obou režimech, se vyhýbá reflexi za běhu. Příkladem je JSON s generátorem zdrojů:

**Samostatný `Program.cs`** v konzolovém projektu `net10.0`. Přes `dotnet run` běží s JIT; pro Native AOT jej publikujte podle předchozího bloku (vyžaduje nativní toolchain).

```csharp
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Serialization;

var objednavka = new Objednavka(42, "Kniha");
// Metadata vytvoří generátor zdrojů při buildu; serializace nepotřebuje reflexi za běhu.
Console.WriteLine(JsonSerializer.Serialize(objednavka, AppJsonContext.Default.Objednavka));
Console.WriteLine($"Generování kódu za běhu: {RuntimeFeature.IsDynamicCodeSupported}");

public record Objednavka(int Id, string Produkt);

[JsonSerializable(typeof(Objednavka))]
internal partial class AppJsonContext : JsonSerializerContext { }
```

Výstup v režimu JIT: `{"Id":42,"Produkt":"Kniha"}` a `Generování kódu za běhu: True`. V Native AOT by druhý řádek vypsal `False`.

<span id="readytorun-rychlejší-start-bez-omezení-reflexe"></span>

### ReadyToRun – předpřipravený kód s JIT zálohou

**Publikace pro Windows x64.**

```bash
dotnet publish -c Release -r win-x64 -p:PublishReadyToRun=true
```

R2R zachovává plnou reflexi a dynamické funkce, protože JIT je stále k dispozici. Výstup je větší a předpřipravený kód bývá méně optimalizovaný než finální JIT kód; runtime jej u horkých metod nahradí.

<span id="porovnání-doby-startu-orientační-jednoduchá-webapi"></span>

### Jak porovnat režimy

Konkrétní milisekundy a megabajty se liší podle aplikace a hostitele, proto je kapitola neuvádí. Porovnejte vlastní aplikaci publikovanou ve všech režimech na cílovém hostiteli: dobu do připravenosti, paměť po zahřátí, propustnost v ustáleném stavu a velikost výstupu. Každý údaj měřte opakovaně.

## 3. Kdy použít

**JIT (výchozí)** je vhodný pro většinu dlouho běžících služeb a desktopových aplikací, kód s reflexí, `dynamic`, kompilovanými Expression Trees nebo pluginy.

**ReadyToRun** zvažte, když měření ukáže, že JIT tvoří významnou část startu, a aplikace potřebuje plné možnosti runtime.

**Native AOT** zvažte pro nástroje příkazové řádky, krátce běžící procesy a služby, kde záleží na startu a paměti, pokud aplikace i všechny knihovny splní omezení. Podporu konkrétního hostitele (funkce, kontejnerová platforma) ověřte v jeho dokumentaci.

## 4. Časté chyby

- **Native AOT s reflexí bez anotací**: typy nalezené jen dynamicky mohou být odstraněny. Použijte `[DynamicallyAccessedMembers]`, generátory zdrojů a řešte varování IL2xxx/IL3xxx.
- **Záměna Native AOT a self-contained**: `--self-contained` přibalí runtime, ale aplikace dál používá JIT.
- **Ignorování varování trimmingu**: varování znamená, že kód může v publikovaném výstupu selhat. Opravte je nebo funkci neposkytujte.
- **Očekávání „AOT je vždy rychlejší“**: dlouho běžící služba s JIT a dynamickou PGO může mít v ustáleném stavu vyšší propustnost.

---

<details>
<summary>Volitelné podrobnosti: optimalizace za běhu a omezení Native AOT</summary>

<span id="jit-optimalizace-které-aot-nedokáže"></span>

### Optimalizace za běhu: vrstvená kompilace a PGO

**Zjednodušené schéma.**

```text
Tier 0: rychlý překlad bez většiny optimalizací
  ↓ metoda je volána často (dlouhá smyčka může přejít přes OSR, On-Stack Replacement: výměnu kódu ještě běžící metody)
Instrumentovaný překlad: sbírá profil volání a větví (dynamická PGO)
  ↓
Tier 1: optimalizovaný překlad s využitím nasbíraného profilu
```

Dynamická PGO umožní například **ochrannou devirtualizaci**: pokud za rozhraním v praxi převládá jeden typ, JIT vloží rychlou cestu pro tento typ a ponechá obecné volání jako zálohu. Native AOT tyto informace z běhu nemá; kompilátor optimalizuje podle statické analýzy a cílové instrukční sady zvolené při publikaci.

<span id="nativeaot-omezení"></span>

### Omezení Native AOT

- Nelze načítat nová sestavení za běhu ani generovat kód (`Reflection.Emit`); kompilované Expression Trees se interpretují.
- Reflexe funguje jen pro členy, které zůstaly po trimmingu; `Activator.CreateInstance(Type)` potřebuje anotace nebo staticky známý typ.
- Serializéry založené na reflexi potřebují konfiguraci; preferujte `System.Text.Json` s `JsonSerializerContext`.
- ASP.NET Core podporuje Native AOT jen pro část funkcí (například minimal API s generátorem zdrojů); MVC a Razor Pages podporovány nejsou.

<span id="jak-vybrat-pro-cloudkontejnery"></span>

### Jak vybírat pro cloud a kontejnery

**Orientační rozhodovací schéma.**

```text
Dlouho běžící služba bez omezení na start  → JIT (výchozí)
Častý scale-out, JIT viditelný v trase startu → zvážit ReadyToRun
Krátké procesy, kompatibilní kód i knihovny   → zvážit Native AOT
Pluginy, dynamické načítání, Reflection.Emit   → JIT
```

Rozhodnutí potvrďte měřením na cílové platformě; obrazy kontejnerů, limity CPU a paměti mění výsledek.

</details>
