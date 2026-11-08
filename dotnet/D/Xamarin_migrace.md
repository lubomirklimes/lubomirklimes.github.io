# Xamarin a .NET MAUI – migrace a přechod

Podpora Xamarin skončila **1. května 2024** ([Microsoft](https://dotnet.microsoft.com/en-us/apps/xamarin)). Tato kapitola je migrační tahák pro existující aplikace, nikoli doporučení vytvářet nové Xamarin projekty. Cílem ukázek je .NET MAUI 10 / C# 14; jeho servisní cyklus je odlišný od samotného .NET ([podpora MAUI](https://dotnet.microsoft.com/en-us/platform/support/policy/maui)).

## 1. Princip :id=_1-koncept

<span id="proč-microsoft-přešel-od-xamarin-k-maui"></span>

### Přechod od Xamarin k MAUI

Xamarin.Forms sdílel popis UI nad nativními prvky. MAUI pokračuje v tomto modelu, sjednocuje velkou část projektu a používá handlery: adaptéry mezi sdíleným prvkem a nativním zobrazením. Nezaručuje automaticky lepší výkon každé přenesené aplikace. Ten ověřte měřením startu a důležitých obrazovek.

### Stav platforem

| Původní technologie | Směr migrace |
|---|---|
| Xamarin.Forms | .NET MAUI; přezkoumat XAML, závislosti a vlastní renderery |
| Xamarin.Android / Xamarin.iOS bez Forms | Moderní .NET for Android/iOS; přechod na MAUI UI není povinný |
| Xamarin.Forms UWP | Windows část znovu posoudit pro WinUI 3 v MAUI |

macOS cíl MAUI používá Mac Catalyst. Dostupnost API, nástrojů a minimální verze OS ověřte pro zvolenou verzi; pro nové aplikace vybírejte UI technologii podle požadavků projektu.

## 2. Příklad

### Nový MAUI projekt

Nejprve vytvořte čistý projekt `dotnet new maui -n MojeMauiApp` s kompatibilním workloadem .NET 10. Ověřte jej na jediném cíli (například `dotnet build -f net10.0-android` uvnitř projektu), teprve potom přenášejte funkce. Android potřebuje SDK/JDK; iOS a Mac Catalyst potřebují Mac a Xcode. Starší návody mohou uvádět `net9.0-android`; pro .NET 10 použijte `net10.0-android`.

**Ukázky níže** jsou migrační fragmenty do projektu MAUI, ne samostatné programy. Předpoklady nového projektu viz [MAUI](MAUI.md).

### Klíčové mapování Xamarin → MAUI

V Xamarin.Forms býval kořen v `Application.MainPage`; v moderním MAUI `MauiProgram.CreateMauiApp` sestaví aplikaci a `App.CreateWindow` vytvoří počáteční okno. Zachovejte spouštěcí kód nové šablony, nepřepisujte jej starým konstruktorem App.

**Fragment:** jádro metody `MauiProgram.CreateMauiApp`; projekt má vlastní třídu `App`.

```csharp
var builder = Microsoft.Maui.Hosting.MauiApp.CreateBuilder();
builder.UseMauiApp<App>();
return builder.Build();
```

Fragment vyžaduje `using Microsoft.Maui.Hosting;`. Dřívější URI `http://xamarin.com/schemas/2014/forms` nahraďte MAUI URI `http://schemas.microsoft.com/dotnet/2021/maui`; prefix `x` zůstává definovaný přes `http://schemas.microsoft.com/winfx/2009/xaml`. Samotná výměna URI nezajistí kompatibilitu vlastních prvků, resources a code-behind.

### Migrace vlastního rendereru na handler

Nejprve ověřte, zda už stejné chování nepokrývá sdílená vlastnost. Pro zaoblení tlačítka není vlastní iOS renderer nutný:

**Fragment XAML:** prvek uvnitř layoutu stránky MAUI.

```xml
<Button Text="Uložit" CornerRadius="12"/>
```

Je-li nativní zásah potřebný, přepište renderer do handleru nebo jeho mapování. Použijte správný nativní typ pro cílový OS, registraci v `ConfigureMauiHandlers` a odpovídající odpojení událostí v `DisconnectHandler`. iOS `Layer` není vlastnost Windows ani Android tlačítka; takový kód nepatří bez podmínky do sdílené třídy. Mapování může ovlivnit všechny instance typu, proto rozsah změny vymezte.

<span id="platformě-specifický-kód"></span>

### Kód pro konkrétní platformu

**Fragment** těla metody s podmíněným překladem pro jednotlivé platformy.

```csharp
#if ANDROID
Android.Util.Log.Debug("Migrace", "Běh na Androidu.");
#elif IOS
System.Diagnostics.Debug.WriteLine("Běh na iOS.");
#endif
```

Pro rozsáhlejší funkci vytvořte společné rozhraní a implementace v `Platforms/Android` a `Platforms/iOS`, registrované v DI. Oprávnění přeneste nejen do kódu, ale také do manifestů a vysvětlujících textů.

## 3. Kdy použít

Přenášejte funkční celky: nejprve knihovny a datové modely, potom obrazovky, navigaci a nativní integrace. Po každém kroku testujte reálné důležité cesty na cílovém OS. Zálohujte původní stav a počítejte i se změnami balíčků, sestavení, podepisování a distribuce; běžící projekt není totéž jako úspěšné vydání do obchodu.

## 4. Časté chyby při migraci

- Pouze změnit XAML namespace a očekávat stejné chování. Chybný namespace nebo třída může selhat už při překladu.
- Ponechat Xamarin.Essentials a nekompatibilní platformní balíčky. Sdílená zařízení API jsou nyní ve jmenných prostorech `Microsoft.Maui.*`; ověřte náhrady balíčků.
- Přenést veškeré změny UI do pozadí. `MainThread.InvokeOnMainThreadAsync` slouží k návratu na UI vlákno, nikoli k automatickému opravení životnosti stránky.
- Považovat okamžitou změnu všech obrazovek za podmínku migrace. Postupné ověřitelné kroky usnadní dohledání regresí.

<details>
<summary>Volitelné: Shell navigace a MVVM</summary>

### Shell navigace

Zaregistrujte trasu a použijte relativní navigaci pro detail mimo vizuální hierarchii. Přijatý parametr není důvěryhodný objekt ani důkaz oprávnění ke čtení dat. Úplný malý příjem přes `IQueryAttributable` je v [MAUI](MAUI.md).

**Fragment:** dva kroky na různých místech existující aplikace.

```csharp
// Konstruktor AppShell po InitializeComponent, jednou pro aplikaci:
Routing.RegisterRoute("detail", typeof(DetailPage));
// Asynchronní obsluha v aktivním Shellu:
await Shell.Current.GoToAsync("detail?id=42");
```

Fragment potřebuje `using Microsoft.Maui.Controls;` a `DetailPage` z předchozí kapitoly; řádky nejsou samostatným programem.

### MVVM s CommunityToolkit.Mvvm

Balíček `CommunityToolkit.Mvvm` poskytuje změnová oznámení a příkazy generované při překladu. Přeneste také deklarace závislostí: generátor doplní jen vlastnosti a příkazy, repozitář i ID produktu musí dodat aplikace.

**Soubor `DetailViewModel.cs`:** úplná třída a její kontrakt v knihovně s balíčkem CommunityToolkit.Mvvm. Zdrojový generátor potřebuje `partial`. Implementaci repozitáře registrujte v aplikaci.

```csharp
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
public interface IProduktRepo
{
    Task<string> ZiskejNazevAsync(int id, CancellationToken ct);
}
public partial class DetailViewModel(IProduktRepo repo) : ObservableObject
{
    public int ProduktId { get; set; }
    [ObservableProperty] private string nazev = "";
    [ObservableProperty] private bool nacitani;
    [RelayCommand]
    private async Task NactiAsync(CancellationToken ct)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(ProduktId);
        Nacitani = true;
        try { Nazev = await repo.ZiskejNazevAsync(ProduktId, ct); }
        finally { Nacitani = false; }
    }
}
```

Chybu příkazu musí aplikace vědomě zpracovat a zobrazit; `finally` pouze obnoví příznak. [Migrační dokumentace](https://learn.microsoft.com/en-us/dotnet/maui/migration/?view=net-maui-10.0).

</details>
