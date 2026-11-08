# Serializace a deserializace

**Příklady:** .NET 10 / C# 14. Samostatné bloky C# jsou jednotlivé náhrady `Program.cs` v projektu `dotnet new console -f net10.0`, spouštěné přes `dotnet run`. Bloky nespojujte; fragmenty a ukázky s dalšími požadavky jsou označené.

Serializace převádí objekty na přenositelná data, deserializace je načítá zpět. JSON je textový formát; úspěšné načtení ještě neznamená, že údaje splňují pravidla aplikace.

## JSON pomocí `System.Text.Json`

Ukázka zkouší i neplatné vstupy. Knihovna je součástí .NET, další balíček nepotřebujete. Deklarace typu patří za příkazy programu.

```csharp
using System.Text.Json;
string json = JsonSerializer.Serialize(new Osoba("Petr", 30));
Console.WriteLine(json);
foreach (string vstup in new[] { json, "null", "{", "{\"Jmeno\":\"\",\"Vek\":-1}" })
{
    try
    {
        var osoba = JsonSerializer.Deserialize<Osoba>(vstup);
        Console.WriteLine(osoba is { Vek: >= 0 } && !string.IsNullOrWhiteSpace(osoba.Jmeno)
            ? osoba.Jmeno : "Neplatná osoba.");
    }
    catch (JsonException) { Console.WriteLine("Neplatný JSON."); }
}
public record Osoba(string Jmeno, int Vek);
```

Výstup: `{"Jmeno":"Petr","Vek":30}`, `Petr`, `Neplatná osoba.`, `Neplatný JSON.`, `Neplatná osoba.`. JSON `null` není syntaktická chyba. Anotace nenulovatelnosti samy nezaručují platnost cizích dat; chybějící jméno či záporný věk kontrolujte podle kontraktu.

## Nastavení formátování

Stejná pravidla pojmenování použijte také při zpětném čtení. `PropertyNamingPolicy` není totéž co `PropertyNameCaseInsensitive`.

```csharp
using System.Text.Json;
var moznosti = new JsonSerializerOptions
{
    WriteIndented = true,
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    MaxDepth = 32
};
string json = JsonSerializer.Serialize(new Osoba("Petr", 30), moznosti);
Console.WriteLine(json);
Console.WriteLine(JsonSerializer.Deserialize<Osoba>(json, moznosti)?.Jmeno);
public record Osoba(string Jmeno, int Vek);
```

JSON má odsazené klíče `jmeno` a `vek`, následně se vypíše `Petr`. Webové výchozí nastavení (`JsonSerializerDefaults.Web`) navíc například ignoruje velikost písmen při čtení názvů vlastností. Sdílené nastavení po prvním použití neupravujte.

## Čtení JSON souboru

Vytvoří a uklidí vlastní malý soubor, nic nepřepisuje mimo dočasný adresář.

```csharp
using System.Text.Json;
string adresar = Directory.CreateTempSubdirectory("json-ukazka-").FullName;
try
{
    string cesta = Path.Combine(adresar, "data.json");
    await File.WriteAllTextAsync(cesta, "[{\"Jmeno\":\"Petr\",\"Vek\":30}]");
    await using var soubor = File.OpenRead(cesta);
    if (soubor.Length > 64 * 1024)
        throw new InvalidDataException("Soubor je příliš velký.");
    var seznam = await JsonSerializer.DeserializeAsync<List<Osoba>>(soubor,
        new JsonSerializerOptions { MaxDepth = 32 });
    if (seznam is null || seznam.Any(o => o is null || o.Vek < 0 || string.IsNullOrWhiteSpace(o.Jmeno)))
        throw new InvalidDataException("Neplatný seznam osob.");
    Console.WriteLine($"Počet osob: {seznam.Count}");
}
finally { Directory.Delete(adresar, recursive: true); }
public record Osoba(string Jmeno, int Vek);
```

Výstup: `Počet osob: 1`. Proud se uvolní před smazáním adresáře i při chybě. `DeserializeAsync` zde stále vytváří celý seznam v paměti. Limit délky a hloubky je ukázkový; pro nedůvěryhodný měnící se vstup potřebujete také vynucený limit skutečně přečtených dat, čas a pravidla počtu položek. Chyby `IOException` a `JsonException` nezaměňujte.

## Atributy pro mapování

Atributy mění přenosový tvar bez změny názvů v C#.

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;
var produkt = new Produkt { Nazev = "Kniha", InterniBod = "neodesílat" };
Console.WriteLine(JsonSerializer.Serialize(produkt));
public sealed class Produkt
{
    [JsonPropertyName("product_name")]
    public required string Nazev { get; init; }
    [JsonIgnore]
    public string InterniBod { get; init; } = "";
}
```

Výstup: `{"product_name":"Kniha"}`. `required` vyžaduje přítomnost vlastnosti, nikoli automaticky neprázdnou hodnotu. `JsonIgnore` je pravidlo tohoto serializátoru, nikoli obecná ochrana tajných údajů.

<details>
<summary>Volitelné: Newtonsoft.Json a vlastní konvertory</summary>

**Samostatný konzolový projekt s balíčkem `Newtonsoft.Json`.** Instalace: `dotnet add package Newtonsoft.Json`; pro reprodukovatelné sestavení připněte vybranou verzi. Knihovna se dodnes používá kvůli existujícím kontraktům a rozšířením.

```csharp
using Newtonsoft.Json;
string json = JsonConvert.SerializeObject(new Osoba("Petr", 30), Formatting.Indented);
var osoba = JsonConvert.DeserializeObject<Osoba>(json);
Console.WriteLine(osoba?.Jmeno ?? "Osoba chybí.");
public record Osoba(string Jmeno, int Vek);
```

Výstup: `Petr`. Pro nestandardní reprezentaci typu v `System.Text.Json` implementujte `System.Text.Json.Serialization.JsonConverter<T>`; nekombinujte automaticky atributy obou knihoven. U nedůvěryhodného JSON nezapínejte libovolné načítání typů přes `TypeNameHandling`.

</details>
