# ML.NET

ML.NET umožňuje trénink a použití některých modelů strojového učení v .NET. Trénink hledá parametry z dat, inference používá již natrénovaný model na novém vstupu. Příklady cílí na C# 14/.NET 10 s knihovnou **Microsoft.ML** řady 5.x; malý sentimentový model níže předvádí postup, ne kvalitu.

## 1. Princip :id=_1-koncept

Pipeline je popis transformací a algoritmu (`IEstimator`); `Fit` z něj na trénovacích datech vytvoří naučený `ITransformer`. Slovník či normalizaci, které se učí z dat, fitujte pouze na trénovací části. Únik informací (data leakage) vzniká například při přípravě slovníku z testu nebo výběru parametrů podle jeho výsledků.

Knihovna nabízí klasifikaci, regresi, shlukování a další úlohy; dostupné trenéry či integrace ONNX (Open Neural Network Exchange, přenosný formát modelů) mohou vyžadovat samostatné balíčky a nativní závislosti. AutoML hledá vhodnou konfiguraci v daném rozpočtu, nezaručuje „nejlepší algoritmus“ pro skutečný provoz.

## 2. Příklad

<span id="binární-klasifikace-predikce-sentimentu"></span>

### Binární klasifikace sentimentu

**Soubor `Program.cs`** v konzolovém projektu s balíčkem `Microsoft.ML` a typy níže. Instalace: `dotnet add package Microsoft.ML`. Vlastní malá syntetická data nevyžadují soubor s daty ani externí licenci a slouží jen k předvedení propojení kroků.

```csharp
using Microsoft.ML;
var trenink = new[]
{
    new Recenze("Výborný výrobek", true), new Recenze("Skvělá kvalita", true),
    new Recenze("Funguje dobře", true), new Recenze("Jsem spokojen", true),
    new Recenze("Hrozný výrobek", false), new Recenze("Špatná kvalita", false),
    new Recenze("Nefunguje vůbec", false), new Recenze("Jsem zklamán", false)
};
var test = new[]
{
    new Recenze("Skvělý nákup", true), new Recenze("Výborná zkušenost", true),
    new Recenze("Hrozná zkušenost", false), new Recenze("Špatný nákup", false)
};
var ml = new MLContext(seed: 42);
var trainData = ml.Data.LoadFromEnumerable(trenink);
var testData = ml.Data.LoadFromEnumerable(test);
var pipeline = ml.Transforms.Text.FeaturizeText("Features", nameof(Recenze.Text))
    .Append(ml.BinaryClassification.Trainers.SdcaLogisticRegression());
var model = pipeline.Fit(trainData);
var metriky = ml.BinaryClassification.Evaluate(model.Transform(testData));
Console.WriteLine($"Accuracy malého testu: {metriky.Accuracy:P1}");
string adresar = Directory.CreateTempSubdirectory("ml-ukazka-").FullName;
try
{
    string cesta = Path.Combine(adresar, "sentiment.zip");
    ml.Model.Save(model, trainData.Schema, cesta);
    var nacteny = ml.Model.Load(cesta, out _);
    using var engine = ml.Model.CreatePredictionEngine<Recenze, PredikceVysledku>(nacteny);
    var vysledek = engine.Predict(new Recenze("Výborná kvalita", false));
    Console.WriteLine($"Predikce: {vysledek.JePozitivni}, pravděpodobnost: {vysledek.Pravdepodobnost:P1}");
}
finally { Directory.Delete(adresar, recursive: true); }
```

**Soubor `Recenze.cs`** ve stejném projektu. Parameterless konstruktor a zapisovatelné vlastnosti umožňují práci mapperu. Label je trénovací správná odpověď, při samotné predikci se nepoužívá jako vstupní rys.

```csharp
using Microsoft.ML.Data;
public sealed class Recenze
{
    public Recenze() { }
    public Recenze(string text, bool pozitivni) { Text = text; JePozitivni = pozitivni; }
    public string Text { get; set; } = "";
    [ColumnName("Label")] public bool JePozitivni { get; set; }
}
public sealed class PredikceVysledku
{
    [ColumnName("PredictedLabel")] public bool JePozitivni { get; set; }
    [ColumnName("Probability")] public float Pravdepodobnost { get; set; }
}
```

Mapování **Probability** je podstatné: české jméno property samo sloupec nepřejmenuje. Trénink a test jsou oddělené už před `Fit` a oba obsahují obě třídy; náhodné rozdělení tak malých dat by jednu třídu mohlo ztratit. Kontrolujte schéma, platnost pravděpodobnosti a uložení/načtení modelu; přesnost změřená na čtyřech větách nic nevypovídá. Seed pomáhá opakovatelnosti, není zárukou bitové shody každé platformy a verze. [Trénink a vyhodnocení](https://learn.microsoft.com/en-us/dotnet/machine-learning/how-to-guides/train-machine-learning-model-ml-net).

### Inference v aplikaci :id=inference-predikce-v-produkci

Výše uložený model se v běžné aplikaci načítá zvlášť, nikoli znovu trénuje při každém startu nebo požadavku. PredictionEngine není bezpečný pro souběžné volání; vytvořte vhodně řízené instance nebo využijte PredictionEnginePool z Microsoft.Extensions.ML. Hromadnou predikci lze řešit přes `ITransformer.Transform`. Ověřujte prázdné/příliš dlouhé vstupy a shodu schématu s modelem.

<span id="automl-přes-cli"></span>

### AutoML a nástroje

Model Builder ve Visual Studiu a mlnet CLI jsou samostatné nástroje, nejsou součástí samotného Microsoft.ML balíčku. Potřebují vlastní instalaci a skutečný dataset. Pro výběr modelu použijte validaci/cross-validation a ponechte závěrečný test stranou. Náhodný split nestačí u skupin uživatelů či časových řad, kde je nutné oddělit skupiny nebo čas.

## 3. Kdy použít

ML.NET může vyhovovat klasifikaci, regresi nebo inferenci v existující .NET aplikaci. Výběr závisí na datech, požadovaných modelech a na tom, kde má model běžet. ONNX model vyžaduje odpovídající preprocessing a výstupní kontrakt, nikoli jen načtení souboru.

## 4. Časté chyby

- Vyhodnotit model na datech, ze kterých vznikl slovník a parametry, a označit to za nezávislý test.
- Vyvodit provozní kvalitu ze čtyř syntetických testovacích textů. Číselný výstup ukázky je pouze kontrola mechaniky.
- Zaměnit Accuracy (podíl správných výsledků), F1 (harmonický průměr precision a recall: podílu správných pozitivních predikcí a záchytu skutečně pozitivních příkladů) a AUC (rozlišování tříd napříč prahy); u nevyvážených dat a malého testu mohou mást.
- Sdílet jeden PredictionEngine mezi současnými požadavky nebo ignorovat nenamapovaný sloupec Probability.
