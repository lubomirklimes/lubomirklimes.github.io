# WPF (Windows Presentation Foundation)

WPF je desktopové UI pro **Windows**. XAML je XML zápis rozhraní; MVVM (Model–View–ViewModel) odděluje data a chování zobrazení od jeho vykreslení. Příklad používá .NET 10 / C# 14 a `net10.0-windows`.

## Vytvoření projektu

Ve Windows s desktopovými nástroji spusťte `dotnet new wpf -n MojeWpfApp -f net10.0`. Následující soubory nahrazují stejnojmenné soubory šablony; `App.xaml` ponechte se `StartupUri="MainWindow.xaml"`. Spuštění: `dotnet run` v adresáři projektu.

## XAML – popis rozhraní

**Soubor `MainWindow.xaml`.** Spolu s code-behind a ViewModelem níže tvoří jeden projekt. Prefix `x` i `x:Class` mají definovaný kontext; namespace třídy musí souhlasit s C#.

```xml
<Window x:Class="MojeWpfApp.MainWindow"
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Pozdrav" Height="240" Width="400">
    <StackPanel Margin="16">
        <TextBox Text="{Binding Jmeno, UpdateSourceTrigger=PropertyChanged}"/>
        <Button Content="Pozdravit" Click="BtnPozdrav_Click" Margin="0,8,0,0"/>
        <TextBlock Text="{Binding Vysledek}" Margin="0,8,0,0"/>
    </StackPanel>
</Window>
```

**Soubor `MainWindow.xaml.cs`.** Code-behind je doprovodná třída XAML. Metodu `InitializeComponent` vygeneruje při sestavení kompilátor XAML ze souboru `MainWindow.xaml`; načte rozhraní a propojí pojmenované prvky. Proto ji nepište ručně.

```csharp
using System.Windows;
namespace MojeWpfApp;
public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        DataContext = new OsobaViewModel { Jmeno = "Petr" };
    }
    private void BtnPozdrav_Click(object sender, RoutedEventArgs e)
    {
        if (DataContext is OsobaViewModel model) model.Pozdrav();
    }
}
```

## Vazba dat :id=data-binding

Binding je vazba vlastnosti UI na zdroj dat. Zde jej určuje `DataContext` okna. `UpdateSourceTrigger=PropertyChanged` přenáší změnu textu průběžně; bez něj TextBox obvykle aktualizuje zdroj až po ztrátě zaměření.

**Soubor `OsobaViewModel.cs`.**

```csharp
using System.ComponentModel;
using System.Runtime.CompilerServices;
namespace MojeWpfApp;
public sealed class OsobaViewModel : INotifyPropertyChanged
{
    private string jmeno = "";
    private string vysledek = "";
    public string Jmeno
    {
        get => jmeno;
        set { if (jmeno == value) return; jmeno = value; Zmeneno(); }
    }
    public string Vysledek
    {
        get => vysledek;
        private set { if (vysledek == value) return; vysledek = value; Zmeneno(); }
    }
    public void Pozdrav() => Vysledek = string.IsNullOrWhiteSpace(Jmeno)
        ? "Zadejte jméno." : $"Ahoj, {Jmeno.Trim()}!";
    public event PropertyChangedEventHandler? PropertyChanged;
    private void Zmeneno([CallerMemberName] string? name = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
```

Pro `Petr` je výsledek `Ahoj, Petr!`, pro bílé znaky `Zadejte jméno.`. Chybný binding (například překlep v názvu vlastnosti) nevyhodí výjimku; při ladění se objeví jen jako hlášení ve výstupu ladicího nástroje.

## MVVM vzor

| Část | Odpovědnost |
|---|---|
| Model | Data a aplikační pravidla |
| ViewModel | Stav a příkazy pro zobrazení, bez závislosti na konkrétním okně |
| View | XAML a případná obsluha čistě vizuálního chování |

Příklad má pro jednoduchost obsluhu tlačítka v code-behind. Ve větším formuláři ji může nahradit `ICommand`; čistě vizuální chování může v code-behind zůstat i při MVVM. Změny navázaných kolekcí oznamuje například `ObservableCollection<T>`, změny jejich položek potřebují vlastní oznámení.

<details>
<summary>Volitelné: příkazy, styly a spouštěče</summary>

`RelayCommand` není vestavěná třída WPF; dodává ji například balíček `CommunityToolkit.Mvvm` (s `using CommunityToolkit.Mvvm.Input`). Příkaz má `Execute` a pravidlo `CanExecute`; u asynchronních akcí používejte odpovídající asynchronní příkaz a řešte chyby. ViewModel by neměl sám otevírat konkrétní okna, jinak jej nelze testovat bez UI.

**Fragment XAML** místo tlačítka v předchozím `StackPanel`. Styl reaguje na stav prvku; není nutná vlastní obsluha pohybu myši.

```xml
<Button Content="Pozdravit" Click="BtnPozdrav_Click">
    <Button.Style>
        <Style TargetType="Button">
            <Setter Property="Background" Value="LightBlue"/>
            <Style.Triggers>
                <Trigger Property="IsMouseOver" Value="True">
                    <Setter Property="Background" Value="SteelBlue"/>
                </Trigger>
            </Style.Triggers>
        </Style>
    </Button.Style>
</Button>
```

UI prvky měňte na jejich vlákně přes Dispatcher. Bindování nezpřístupňuje objekty automaticky bezpečně z více vláken. [Dokumentace WPF](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/overview/).

</details>
