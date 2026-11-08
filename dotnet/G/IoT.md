# .NET IoT

IoT (Internet of Things) propojuje software s fyzickými zařízeními. GPIO jsou řízené digitální piny, I²C a SPI sběrnice pro komunikaci s periferiemi; sériový port obsluhuje například samostatný balíček System.IO.Ports. Podpora závisí na desce, OS, ovladači a zapojení, nikoli jen na procesoru ARM.

## 1. Princip :id=_1-koncept

`System.Device.Gpio` poskytuje nízkoúrovňové rozhraní, `Iot.Device.Bindings` konkrétní ovladače senzorů. Standardní .NET 10 potřebuje podporovaný OS a dostatek prostředků; malé mikrokontroléry mohou vyžadovat jiné runtime, například .NET nanoFramework.

Na Raspberry Pi rozlišujte fyzické číslo kontaktu od logického GPIO/BCM označení. Ověřte pinout konkrétní desky. GPIO běžně pracuje s 3,3V logikou a **není vstupem pro přímých 5 V**; použijte vhodný převod úrovní, společnou zem a proudové omezení LED. Před zapojováním vypněte napájení, parametry ověřte podle zařízení. [Lokální LED příklad Microsoftu](https://learn.microsoft.com/en-us/dotnet/iot/tutorials/blink-led).

## 2. Příklad

<span id="blikání-led-gpio-output"></span>

### Blikání LED a ukončení

**Soubor `Program.cs`** pro vlastní projekt na Linuxu (například Raspberry Pi OS) s balíčkem `System.Device.Gpio` a třídou `Blikac` níže. Vyžaduje desku s GPIO, LED zapojenou přes rezistor a oprávnění k řadiči GPIO (`/dev/gpiochip*`). GPIO17 je logické označení pro tento příklad, nikoli obecně fyzický kontakt 17. Současné verze knihovny používají jen logické číslování; starší návody s `PinNumberingScheme` se s nimi nepřeloží.

```csharp
using System.Device.Gpio;
using var stop = new CancellationTokenSource();
using var controller = new GpioController(); // Čísla pinů jsou logická (GPIO/BCM).
const int pin = 17;
ConsoleCancelEventHandler ukonci = (_, e) => { e.Cancel = true; stop.Cancel(); };
Console.CancelKeyPress += ukonci;
try
{
    controller.OpenPin(pin, PinMode.Output);
    await Blikac.BlikejAsync(v => controller.Write(pin, v ? PinValue.High : PinValue.Low),
        ct => Task.Delay(500, ct), stop.Token);
}
catch (OperationCanceledException) when (stop.IsCancellationRequested) { }
finally
{
    Console.CancelKeyPress -= ukonci;
    if (controller.IsPinOpen(pin)) controller.ClosePin(pin);
}
```

**Soubor `Blikac.cs`:** čistá řídicí logika bez závislosti na hardwaru, takže ji lze testovat s paměťovým zapisovačem místo pinu. Při řízeném zrušení se ještě před uzavřením pinu pokusí nastavit nízkou úroveň.

```csharp
public static class Blikac
{
    public static async Task BlikejAsync(Action<bool> zapis, Func<CancellationToken, Task> cekej, CancellationToken ct)
    {
        try
        {
            while (true)
            {
                ct.ThrowIfCancellationRequested();
                zapis(true);
                await cekej(ct);
                zapis(false);
                await cekej(ct);
            }
        }
        finally { zapis(false); }
    }
}
```

Zápis do vadného nebo odpojeného zařízení může selhat i při úklidu; násilné ukončení procesu nezaručuje stav pinu. Pro kritické výstupy potřebujete bezpečný návrh hardwaru, ne samotné finally. Obsluha Ctrl+C proto pin sama nezavírá: jen zruší token, smyčka skončí a pin se zavře až ve `finally`, kdy do něj už nic nezapisuje.

<span id="Čtení-teploty-a-vlhkosti-z-dht22"></span>

### Teplota a vlhkost DHT22

**Fragment:** tělo asynchronní metody s tokenem `ct`, balíčkem `Iot.Device.Bindings`, importem `Iot.Device.DHTxx` a odpovídajícím zapojením. Interval i elektrické parametry určete podle konkrétního senzoru.

```csharp
using var dht = new Dht22(pinNumber: 4);
while (!ct.IsCancellationRequested)
{
    if (dht.TryReadHumidity(out var vlhkost) && dht.TryReadTemperature(out var teplota))
        Console.WriteLine($"Teplota: {teplota.DegreesCelsius:F1} °C, vlhkost: {vlhkost.Percent:F1} %");
    else Console.WriteLine("Měření se nezdařilo.");
    await Task.Delay(TimeSpan.FromSeconds(2), ct);
}
```

Neúspěšné čtení není naměřená nula. Očekávané zrušení zpracujte v nadřazené metodě, která vlastní běh. Některé senzory či ovladače mají platformně citlivé časování.

<span id="i²c-senzor-tlaku-bmp280"></span>

### Senzor BMP280 na I²C

Zapněte správnou sběrnici a ověřte adresu zařízení. Na Raspberry Pi OS se I²C zapíná v `sudo raspi-config` (Interface Options → I2C) a připojená zařízení vypíše `i2cdetect -y 1` z balíčku `i2c-tools`. Stejné označení `busId` na jiném OS či desce nemusí znamenat stejné piny. Ovladač BMP280 z `Iot.Device.Bmxx80` (balíček `Iot.Device.Bindings`) používá `I2cDevice` z `System.Device.I2c`.

**Fragment** asynchronní metody. Adresa 0x77 je výchozí (`Bmx280Base.DefaultI2cAddress`); řada modulů používá 0x76 (`Bmx280Base.SecondaryI2cAddress`). Vzorkování nastavte podle potřebné přesnosti a spotřeby.

```csharp
using System.Device.I2c;
using Iot.Device.Bmxx80;
var nastaveni = new I2cConnectionSettings(busId: 1, deviceAddress: Bmx280Base.DefaultI2cAddress);
using var zarizeni = I2cDevice.Create(nastaveni);
using var bmp280 = new Bmp280(zarizeni);
bmp280.TemperatureSampling = Sampling.Standard;
bmp280.PressureSampling = Sampling.Standard;
var vysledek = await bmp280.ReadAsync();
if (vysledek.Pressure is { } tlak) Console.WriteLine($"Tlak: {tlak.Hectopascals:F2} hPa");
if (vysledek.Temperature is { } teplota) Console.WriteLine($"Teplota: {teplota.DegreesCelsius:F1} °C");
```

<span id="nasazení-na-raspberry-pi"></span>

### Publikování pro desku

**Příkaz** pro projekt MojeIoTApp na podporovaný 64bitový Linux ARM. Balík jen sestaví, na desku jej nepřenáší. RID (Runtime Identifier, zde `linux-arm64`) musí odpovídat skutečnému OS a architektuře, ne jen názvu desky.

```bash
dotnet publish MojeIoTApp.csproj -c Release -r linux-arm64 --self-contained true -o ./publish
```

Přenos, oprávnění a start služby řešte odděleně. Self-contained balík stále potřebuje odpovídající systémové knihovny a ovladače.

## 3. Kdy použít

.NET se hodí pro sběr a lokální zpracování dat na podporovaném zařízení. Není sám hard realtime systém: plánování OS a GC mají vliv na časování. Průmyslové výstupy a bezpečnostní řídicí smyčky vyžadují jinou úroveň návrhu a ověření.

## 4. Časté chyby

- Získat sudo místo zjištění konkrétních zařízení a potřebných přístupových práv. Členství gpio nemusí zpřístupnit I²C, SPI nebo sériový port na každé distribuci.
- Zavřít pin v události a neukončit producenta zápisů; nejprve zrušte běh, poté uvolňujte prostředky.
- Připojit 5V signál přímo na 3,3V GPIO nebo LED bez proudového omezení.
- Považovat úspěšný test řídicí logiky s paměťovým zapisovačem za ověření senzoru či elektrického zapojení.
