# Práce s GPS, senzory a notifikacemi (.NET MAUI)

Sdílená API MAUI zpřístupňují funkce zařízení, ale neodstraňují rozdíly platforem. Ukázky jsou fragmenty pro existující aplikaci MAUI 10 / C# 14, ne samostatné konzolové programy; chování senzorů a oprávnění vyzkoušejte na cílovém zařízení nebo emulátoru. Potřebné workloady a UI kontext viz [MAUI](MAUI.md).

## GPS a geolokace

Poslední známá poloha může být stará nebo `null`. Ani nový požadavek se střední přesností nezaručuje přesnou GPS souřadnici. Oprávnění vyžádejte po vysvětlení uživateli, z UI kontextu.

**Fragment:** tělo asynchronní obsluhy s tokenem `ct`. Importy patří na začátek souboru.

```csharp
using Microsoft.Maui.ApplicationModel;
using Microsoft.Maui.Devices.Sensors;
// V asynchronní metodě stránky:
var stav = await Permissions.CheckStatusAsync<Permissions.LocationWhenInUse>();
if (stav != PermissionStatus.Granted)
    stav = await Permissions.RequestAsync<Permissions.LocationWhenInUse>();
if (stav != PermissionStatus.Granted) return;
try
{
    var pozadavek = new GeolocationRequest(GeolocationAccuracy.Medium, TimeSpan.FromSeconds(10));
    var poloha = await Geolocation.Default.GetLocationAsync(pozadavek, ct);
    if (poloha is null) return;
    System.Diagnostics.Debug.WriteLine($"Čas polohy: {poloha.Timestamp:O}");
}
catch (FeatureNotEnabledException) { /* Nabídněte zapnutí polohy v UI. */ }
catch (PermissionException) { /* Oprávnění se mohlo mezitím změnit. */ }
catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
```

Nedostupnou funkci řešte také přes `FeatureNotSupportedException`; nečekanou chybu nepotlačujte. Nezapisujte skutečné souřadnice bez potřeby do diagnostiky. Pro Android deklarujte coarse i fine polohu uvnitř `manifest`, mimo `application`; systém může udělit jen přibližnou polohu:

**Výřez** souboru `Platforms/Android/AndroidManifest.xml`; prefix `android` definuje kořenový prvek.

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
</manifest>
```

Na iOS přidejte do `Info.plist` srozumitelný `NSLocationWhenInUseUsageDescription`. Další platformní požadavky a případné funkce manifestu viz [dokumentace geolokace](https://learn.microsoft.com/en-us/dotnet/maui/platform-integration/device/geolocation?view=net-maui-10.0). Manifest sám neuděluje oprávnění za běhu.

## Senzory

**Fragment:** metody a pole ve třídě `ContentPage`. Potřebují `using Microsoft.Maui.Devices.Sensors;`. Pojmenovanou obsluhu lze při odchodu odebrat; zastavujte měření, které vlastní tato stránka.

```csharp
private bool meri;
protected override void OnAppearing()
{
    base.OnAppearing();
    if (!Accelerometer.Default.IsSupported || meri) return;
    Accelerometer.Default.ReadingChanged += PriMereni;
    try { Accelerometer.Default.Start(SensorSpeed.UI); meri = true; }
    catch
    {
        Accelerometer.Default.ReadingChanged -= PriMereni;
        throw;
    }
}
private void PriMereni(object? sender, AccelerometerChangedEventArgs e) =>
    MainThread.BeginInvokeOnMainThread(() => Title = $"Zrychlení X: {e.Reading.Acceleration.X:F2}");
protected override void OnDisappearing()
{
    if (meri)
    {
        Accelerometer.Default.ReadingChanged -= PriMereni;
        Accelerometer.Default.Stop();
        meri = false;
    }
    base.OnDisappearing();
}
```

`MainThread` je v `Microsoft.Maui.ApplicationModel`. Globální senzor může používat více stránek, proto ve větší aplikaci koordinujte vlastnictví samostatnou službou. Již zařazená UI aktualizace může doběhnout; pro delší zpracování kontrolujte životnost stránky. Kompas má obdobný životní cyklus, ale jiný typ události a dostupnost.

## Lokální notifikace

MAUI nemá jednotné vestavěné API pro všechny lokální notifikace. Například `Plugin.LocalNotification` je externí balíček; jeho verzi, podporované platformy a registraci `UseLocalNotification()` ověřte podle [dokumentace projektu](https://github.com/thudugala/Plugin.LocalNotification).

**Fragment** asynchronní metody v aplikaci s nainstalovaným a nakonfigurovaným balíčkem `Plugin.LocalNotification`. Názvy typů se mohou mezi hlavními verzemi balíčku měnit, proto je porovnejte s jeho dokumentací. Vyžaduje `using Plugin.LocalNotification;` a potřebné oprávnění podle OS (včetně Android 13+ a povolení uživatelem na iOS).

```csharp
var notifikace = new NotificationRequest
{
    NotificationId = 1,
    Title = "Upozornění",
    Description = "Nezapomeňte na schůzku.",
    Schedule = new NotificationRequestSchedule { NotifyTime = DateTime.Now.AddMinutes(30) }
};
await LocalNotificationCenter.Current.Show(notifikace);
```

Čas doručení může OS posunout; přesné alarmy a běh na pozadí mají další omezení. Zamítnuté oprávnění není úspěšné naplánování.

## Kamera a galerie

**Fragment:** tělo asynchronní metody stránky s prvkem `Image imageView`. Kamera musí být dostupná a mít platformní oprávnění/manifest. Zrušení výběru vrací `null`; řešte také `PermissionException` a `FeatureNotSupportedException` na hranici UI.

```csharp
var foto = await Microsoft.Maui.Media.MediaPicker.Default.PickPhotoAsync();
if (foto is null) return;
await using var vstup = await foto.OpenReadAsync();
using var pamet = new MemoryStream();
byte[] buffer = new byte[8192];
int pocet;
while ((pocet = await vstup.ReadAsync(buffer)) > 0)
{
    if (pamet.Length + pocet > 5 * 1024 * 1024)
        throw new InvalidDataException("Obrázek je příliš velký.");
    pamet.Write(buffer, 0, pocet);
}
byte[] data = pamet.ToArray();
imageView.Source = ImageSource.FromStream(() => new MemoryStream(data, writable: false));
```

Každé vyvolání callbacku dostane **nový otevřený stream**, nikoli již uvolněný vstup. Data zůstávají zachycena ve zdroji obrázku; po jeho nahrazení mohou být uvolněna. Limit bajtů neomezuje rozměry dekódovaného obrázku, ty je potřeba posoudit zvlášť. Pro pořízení snímku použijte `CapturePhotoAsync` a předem `IsCaptureSupported`; [nastavení pickeru](https://learn.microsoft.com/en-us/dotnet/maui/platform-integration/device-media/picker?view=net-maui-10.0) se liší podle OS.

<details>
<summary>Volitelné: push notifikace a mapa</summary>

Push přichází ze vzdálené služby, na rozdíl od lokálně naplánovaného oznámení. Android používá například Firebase Cloud Messaging (FCM), iOS službu Apple Push Notification service (APNs). Jsou potřeba registrace zařízení, tokeny, důvěryhodný server a konfigurace konkrétního poskytovatele; prosté přidání balíčku toto nenahradí.

Mapa vyžaduje `Microsoft.Maui.Controls.Maps`, `UseMauiMaps()` v `MauiProgram`, potřebná platformní nastavení a případné API klíče. Standardní mapový prvek v MAUI 10 není podporován na Windows; [podmínky podle verze](https://learn.microsoft.com/en-us/dotnet/maui/user-interface/controls/map?view=net-maui-10.0) se mohou měnit.

**Fragment XAML** stránky s mapou; na Windows mapový prvek dostupný není (viz výše).

```xml
<ContentPage xmlns="http://schemas.microsoft.com/dotnet/2021/maui"
             xmlns:x="http://schemas.microsoft.com/winfx/2009/xaml"
             xmlns:maps="clr-namespace:Microsoft.Maui.Controls.Maps;assembly=Microsoft.Maui.Controls.Maps">
    <maps:Map x:Name="MapView" MapType="Street"/>
</ContentPage>
```

Oblast lze nastavit přes `MapSpan.FromCenterAndRadius` z `Microsoft.Maui.Maps`; není to totéž jako získání aktuální polohy zařízení.

</details>
