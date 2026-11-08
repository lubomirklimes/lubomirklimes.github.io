# Windows Forms (WinForms)

WinForms vytváří formuláře s ovládacími prvky pro **Windows**; nejedná se o multiplatformní UI. Následující příklad cílí na .NET 10 / C# 14 a `net10.0-windows`. Prvky uživatelského rozhraní (UI) smí měnit jen vlákno, které je vytvořilo; ve WinForms je to UI vlákno se smyčkou zpráv, obvykle hlavní vlákno aplikace.

## Vytvoření projektu

Ve Windows se SDK .NET 10 a nástroji pro desktop spusťte `dotnet new winforms -n MojeAplikace -f net10.0`. Potom `cd MojeAplikace` a `dotnet run`. V IDE lze formulář navrhovat vizuálním návrhářem; zde prvky vytvoříme kódem, takže nepotřebujeme jeho generovaný soubor.

## Struktura aplikace

**Soubor `Program.cs`.** Spolu s oběma částmi `MainForm` níže tvoří jeden projekt.

```csharp
using System.Windows.Forms;
namespace MojeAplikace;
internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }
}
```

**Soubor `MainForm.cs`.** `Application.Run` spouští smyčku zpráv pro události okna. V projektu ponechte jen jednu definici vstupního bodu.

```csharp
using System.Drawing;
using System.Windows.Forms;
namespace MojeAplikace;
public partial class MainForm : Form
{
    private readonly Button btnNacti = new() { Text = "Načíst", AutoSize = true };
    private readonly Label labelStav = new() { Text = "Připraveno.", AutoSize = true };
    private readonly ListBox listBoxData = new() { Width = 250, Height = 100 };
    public MainForm()
    {
        Text = "Ukázka WinForms";
        ClientSize = new Size(300, 220);
        var panel = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown };
        panel.Controls.AddRange([btnNacti, labelStav, listBoxData]);
        Controls.Add(panel);
        btnNacti.Click += BtnNacti_Click;
        FormClosing += (_, _) => zivotnost.Cancel();
        Disposed += (_, _) => zivotnost.Dispose();
    }
}
```

## Tlačítko a událost

Událost `Click` propojuje tlačítko s metodou. `async void` patří k obsluze události, jejíž signatura nevrací `Task`; ostatní asynchronní metody mají vracet čekatelný `Task`. Obsluha níže sama zpracuje očekávané chyby, protože ji volající nemůže běžně `await`ovat.

## Běžné ovládací prvky

| Prvek | Účel |
|---|---|
| `Button`, `Label` | Akce a textový popisek |
| `TextBox` | Textový vstup |
| `ListBox`, `ComboBox` | Výběr položek |
| `DataGridView` | Tabulka dat |
| `MenuStrip` | Nabídka aplikace |

<span id="práce-s-formulovými-prvky"></span>

## Práce s ovládacími prvky

**Fragment** do metody `MainForm` po vytvoření prvků. `SelectedItem` může být `null`.

```csharp
listBoxData.Items.Clear();
listBoxData.Items.Add("Petr");
string? vybrana = listBoxData.SelectedItem?.ToString();
labelStav.Text = vybrana ?? "Nic není vybráno.";
```

## Asynchronní operace v UI :id=async-operace-v-ui

**Soubor `MainForm.Loading.cs`**, druhá část stejné třídy. Data jsou lokální, žádný server se nevolá. Při zavření okna zrušíme čekání; kontrola stavu brání změně již uvolněných prvků.

```csharp
using System.Windows.Forms;
namespace MojeAplikace;
public partial class MainForm
{
    private readonly CancellationTokenSource zivotnost = new();
    private async void BtnNacti_Click(object? sender, EventArgs e)
    {
        btnNacti.Enabled = false;
        labelStav.Text = "Načítám…";
        try
        {
            string[] data = await NactiDataAsync(zivotnost.Token);
            if (IsDisposed || Disposing) return;
            listBoxData.Items.Clear();
            listBoxData.Items.AddRange(data);
            labelStav.Text = "Hotovo.";
        }
        catch (OperationCanceledException) when (zivotnost.IsCancellationRequested) { }
        catch (IOException)
        {
            if (!IsDisposed && !Disposing) labelStav.Text = "Data se nepodařilo načíst.";
        }
        finally
        {
            if (!IsDisposed && !Disposing) btnNacti.Enabled = true;
        }
    }
    private static async Task<string[]> NactiDataAsync(CancellationToken ct)
    {
        await Task.Delay(100, ct);
        return ["Petr", "Anna"];
    }
}
```

Po stisku se objeví dvě jména a `Hotovo.`; po chybě se tlačítko znovu povolí. Výchozí `await` v obsluze vrátí pokračování do zachyceného UI kontextu, tedy zpět na UI vlákno. Práce mimo UI vyžaduje návrat přes `InvokeAsync`/`Invoke`; `ConfigureAwait(false)` tento návrat nezaručuje. CPU náročnou práci nepouštějte synchronně v obsluze.

<details>
<summary>Volitelné: dialog a vazba dat</summary>

Vlastněný dialog uvolněte přes `using`; `ShowDialog(this)` zajistí vztah k rodiči a `DialogResult.OK` rozhoduje o převzetí výsledku. Návrh konkrétního dialogu závisí na jeho vstupu a validaci.

Pro vazbu dat nabízí WinForms `BindingSource`; seznam se změnovými oznámeními může být `BindingList<T>`. Samotný `List<T>` změny kolekce automaticky neoznamuje. Vlastněný `BindingSource` také uvolňujte, například v kontejneru komponent návrháře.

</details>
