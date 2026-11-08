# .NET MAUI – multiplatformní aplikace

.NET MAUI (Multi-platform App UI) sdílí C# a XAML rozhraní pro Android, iOS, Windows a macOS (přes **Mac Catalyst**). Jedna kódová základna neodstraňuje rozdíly oprávnění, vzhledu a nasazení. Zde je cílem .NET MAUI 10 / C# 14; verze nástrojů pro jednotlivé OS se řídí [podporovanými platformami](https://learn.microsoft.com/en-us/dotnet/maui/supported-platforms?view=net-maui-10.0).

## Vytvoření projektu

S nainstalovaným odpovídajícím workloadem vytvořte projekt `dotnet new maui -n MojeMauiApp`. Pro Windows vyberte jeho Windows target, například `dotnet build -f net10.0-windows10.0.19041.0`; Android používá `net10.0-android` a potřebuje Android SDK/JDK i zařízení nebo emulátor. iOS vyžaduje také Mac s odpovídajícím Xcode a pro nasazení potřebné podepisování. Linux není oficiálním desktopovým cílem MAUI.

**Ukázky v této kapitole** jsou soubory a fragmenty projektu MAUI, ne samostatné konzolové programy. Ke spuštění potřebujete workload `maui` (`dotnet workload install maui`) a pro mobilní cíle také SDK, emulátor či zařízení a případně podepisování podle platformy.

## Struktura projektu

**Orientační výřez projektu šablony:**

```text
MauiProgram.cs          konfigurace služeb a aplikace
App.xaml / App.xaml.cs prostředky a vytváření okna
AppShell.xaml          navigační kořen
MainPage.xaml          stránka a její doprovodná třída
Platforms/             manifesty a kód jednotlivých OS
Resources/             obrázky, fonty a další prostředky
```

XAML je deklarativní XML popis prvků. V moderním `App` se počáteční okno vytváří přes `CreateWindow`; staré nastavování `Application.MainPage` nepřenášejte mechanicky.

## UI v XAML

**Náhrada `MainPage.xaml`** v projektu MojeMauiApp. Prefix `x`, třída i namespace musí souhlasit.

```xml
<ContentPage xmlns="http://schemas.microsoft.com/dotnet/2021/maui"
             xmlns:x="http://schemas.microsoft.com/winfx/2009/xaml"
             x:Class="MojeMauiApp.MainPage" Title="Pozdrav">
    <VerticalStackLayout Padding="16" Spacing="8">
        <Label Text="Zadejte jméno:"/>
        <Entry x:Name="EntryJmeno" Placeholder="Jméno"/>
        <Button Text="Pozdravit" Clicked="OnPozdravClicked"/>
        <Label x:Name="LabelVystup"/>
    </VerticalStackLayout>
</ContentPage>
```

**Doprovodná třída této stránky** (`MainPage.xaml.cs`).

```csharp
using Microsoft.Maui.Controls;
namespace MojeMauiApp;
public partial class MainPage : ContentPage
{
    public MainPage() => InitializeComponent();
    private void OnPozdravClicked(object? sender, EventArgs e)
    {
        string jmeno = EntryJmeno.Text?.Trim() ?? "";
        LabelVystup.Text = jmeno.Length == 0 ? "Zadejte jméno." : $"Ahoj, {jmeno}!";
    }
}
```

## Navigace mezi stránkami

Shell spravuje navigační hierarchii a zásobník stránek. DI registrace sama **nevytváří trasu**. V konstruktoru `AppShell` po `InitializeComponent()` zaregistrujte `Routing.RegisterRoute("detail", typeof(DetailPage))`; podle závislostí přidejte také `builder.Services.AddTransient<DetailPage>()` do `MauiProgram`.

**Soubor `DetailPage.cs`**; trasa musí být registrována jednou. `IQueryAttributable` zpracuje vstup výslovně a je vhodnější než reflexivní `QueryProperty` při úplném ořezání a překladu předem (AOT).

```csharp
using Microsoft.Maui.Controls;
namespace MojeMauiApp;
public sealed class DetailPage : ContentPage, IQueryAttributable
{
    private readonly Label vystup = new();
    public DetailPage() => Content = vystup;
    public void ApplyQueryAttributes(IDictionary<string, object> query)
    {
        vystup.Text = query.TryGetValue("id", out var hodnota)
            && int.TryParse(hodnota?.ToString(), out int id) && id > 0
            ? $"Produkt {id}" : "Neplatné ID produktu.";
    }
}
```

Z obsluhy v aktivním Shellu pak volejte `await Shell.Current.GoToAsync("detail?id=42")`. Jde o relativní trasu přidané stránky. Absolutní zápis s `//` je určen pro trasy z hierarchie `AppShell`, ne pro stránku registrovanou přes `Routing.RegisterRoute`. Pro řetězcové query hodnoty zajistěte URL kódování. [Pravidla navigace](https://learn.microsoft.com/en-us/dotnet/maui/fundamentals/shell/navigation?view=net-maui-10.0).

## MVVM s CommunityToolkit.Mvvm

MVVM odděluje stav a příkazy od stránky. `CommunityToolkit.Mvvm` je samostatný NuGet balíček, MAUI jej neobsahuje: přidejte jej příkazem `dotnet add package CommunityToolkit.Mvvm`. Příklad je napsán pro řadu 8.x balíčku; při upgradu na novou hlavní verzi si přečtěte poznámky k vydání.

**Soubor `MainViewModel.cs`.** Model nezávisí na MAUI; zbývající kód doplní generátor zdrojového kódu z balíčku.

```csharp
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
public partial class MainViewModel : ObservableObject
{
    [ObservableProperty] private string jmeno = "";
    [ObservableProperty] private string vysledekText = "";
    [RelayCommand]
    private void Pozdrav() => VysledekText = string.IsNullOrWhiteSpace(Jmeno)
        ? "Zadejte jméno." : $"Ahoj, {Jmeno.Trim()}!";
}
```

Generátor doplní vlastnosti `Jmeno`, `VysledekText` a příkaz `PozdravCommand`. Stránce nastavte `BindingContext` na instanci modelu a bindujte tyto vlastnosti; bez toho model s UI propojen není.

<details>
<summary>Volitelné: rozdíly platforem</summary>

Sdílená API pro polohu a kameru stále vyžadují manifesty, oprávnění a kontrolu dostupnosti na konkrétním OS. Podmínky `#if ANDROID`/`#if IOS` použijte pro skutečně platformní část; větší rozdíly skryjte za rozhraní služby. Podrobnosti viz [GPS, senzory a notifikace](Mobile_Features.md).

</details>
