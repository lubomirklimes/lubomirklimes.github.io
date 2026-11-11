# Kivy

Kivy je knihovna pro rozhraní řízená událostmi, se zaměřením na dotykové ovládání a více platforem. Prvky vykresluje vlastním způsobem, proto obvykle nevypadají jako nativní formuláře Windows nebo macOS. Hodí se pro dotykové panely, kiosky a aplikace s vlastní grafikou; pro klasické desktopové tabulky zvažte také [Qt](PyQt_PySide.md).

## 1. Princip :id=_1-concept

`App` spravuje život aplikace a smyčku událostí. Metoda `build()` vrátí kořenový widget; `run()` otevře okno a začne zpracovávat události. Rozložení, například `BoxLayout`, rozmístí potomky. `bind()` připojí funkci ke změně vlastnosti nebo události tlačítka.

Kivy **Property** je vlastnost objektu, která umí oznámit změnu. `NumericProperty` ukládá číslo; při změně může zavolat připojenou obsluhu a aktualizovat text. Obyčejné `self.count = 0` bez deklarace Property tuto automatickou vazbu nevytvoří.

### Příprava prostředí

Vytvořte projekt s `.venv` podle [úvodu](../A/Uvod_do_Pythonu.md). Pro první spuštění zvolte běžný CPython 3.12 a grafickou plochu s funkčním grafickým ovladačem. Kivy 2.3.2 uvádí podporu běžného CPythonu 3.8–3.14; z tohoto rozsahu průvodce používá 3.12 nebo novější. Sestavení Pythonu bez globálního zámku interpretu GIL (free-threaded) tato verze nepodporuje. U jiného vydání ověřte [požadavky a instalační balíčky Kivy](https://kivy.org/doc/stable/gettingstarted/installation.html) pro konkrétní systém a architekturu procesoru.

Příkazy spusťte z projektové složky v terminálu. Windows PowerShell:

```powershell
.\.venv\Scripts\python.exe -m pip install "kivy[base]"
.\.venv\Scripts\python.exe counter_kivy.py
```

macOS/Linux:

```bash
.venv/bin/python -m pip install "kivy[base]"
.venv/bin/python counter_kivy.py
```

Druhý příkaz použijte po uložení programu níže. Skupina `[base]` přidá základní závislosti pro okno a vykreslování; další audio/video moduly nejsou potřeba. Připravený balíček pro pip, **wheel**, šetří místní kompilaci. Pokud pro danou kombinaci chybí, vyberte podporovanou kombinaci nebo postupujte podle návodu na sestavení; samotný novější Python podporu grafických závislostí nezajistí.

## 2. Příklad :id=_2-example

**Samostatný příklad:** `counter_kivy.py` v UTF-8. Rozhraní je celé v Pythonu, žádný soubor `.kv` nevytvářejte.

```python
from kivy.app import App
from kivy.clock import Clock
from kivy.metrics import dp
from kivy.properties import NumericProperty
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.button import Button
from kivy.uix.label import Label


class CounterPanel(BoxLayout):
    count = NumericProperty(0)

    def __init__(self, **kwargs):
        super().__init__(orientation="vertical", spacing=dp(12), padding=dp(20), **kwargs)
        self.value_label = Label(text="Počet: 0", font_size="24sp")
        self.status = Label(text="Zvolte Přidat.")
        self.pending = None
        self.bind(count=self.show_count)

        self.add_widget(self.value_label)
        for title, handler in (
            ("Přidat", self.increment),
            ("Vynulovat", self.reset),
            ("Zavřít", self.close),
        ):
            button = Button(text=title, size_hint_y=None, height=dp(48))
            button.bind(on_release=handler)
            self.add_widget(button)
        self.add_widget(self.status)

    def show_count(self, instance, value):
        self.value_label.text = f"Počet: {int(value)}"

    def increment(self, button):
        self.count += 1
        self.status.text = "Přidáno"
        if self.pending is not None:
            self.pending.cancel()
        self.pending = Clock.schedule_once(self.clear_status, 1.5)

    def clear_status(self, dt):
        self.pending = None
        self.status.text = "Připraveno"

    def reset(self, button):
        self.cancel_pending()
        self.count = 0
        self.status.text = "Vynulováno"

    def cancel_pending(self):
        if self.pending is not None:
            self.pending.cancel()
            self.pending = None

    def close(self, button):
        App.get_running_app().stop()


class CounterApp(App):
    title = "Počítadlo — Kivy"

    def build(self):
        return CounterPanel()

    def on_stop(self):
        if self.root is not None:
            self.root.cancel_pending()


if __name__ == "__main__":
    CounterApp().run()
```

### Očekávané chování

V okně **Počítadlo — Kivy** uvidíte `Počet: 0`, tlačítka a stav. Po jednom kliknutí či klepnutí na **Přidat** se objeví `Počet: 1`, po druhém `Počet: 2`. Stav `Přidáno` se přibližně po 1,5 sekundě změní na `Připraveno`. **Vynulovat** vrátí počet na nulu a stav na `Vynulováno`; čekající přepnutí stavu se zruší. **Zavřít** nebo křížek ukončí aplikaci. Kivy může při startu psát diagnostiku do terminálu; hlavní výsledek je změna v okně.

`on_release` nastane při uvolnění tlačítka. Obsluha dostane jeho instanci. Vazba na `count` předá `show_count` instanci a novou hodnotu; callback plánovaný přes `Clock` dostane uplynulý čas `dt`. `dp` značí jednotky zohledňující hustotu obrazovky, `sp` navíc škálování písma. Layout volí polohy a rozměry; `size_hint_y=None` dovolí pevnou výšku tlačítka v `dp`.

## 3. Kdy použít :id=_3-when-to-use

Kivy umožňuje sdílet značnou část rozhraní mezi desktopem a mobilem. Přenos kódu však neřeší automaticky oprávnění, klávesnici na displeji, velikost obrazovky ani život aplikace při přechodu do pozadí.

`Clock.schedule_once()` naplánuje callback do hlavní smyčky. Je vhodný pro krátké změny stavu, nikoli pro dlouhý výpočet. Práci na pozadí oddělte a její výsledek předejte do GUI například přes `Clock.schedule_once()` nebo dekorátor `@mainthread`. I takto naplánovaná obsluha musí rychle skončit. Objekt události lze zrušit metodou `.cancel()`, jak ukazuje úklid v `on_stop()`; zrušení události nezastaví samostatnou pracovní úlohu. Viz [dokumentace Clock](https://kivy.org/doc/stable/api-kivy.clock.html).

Pro Android se používá **python-for-android**, často řízený nástrojem **Buildozer**, který připravuje i Android SDK/NDK, tedy vývojové a nativní kompilační nástroje. Sestavovací prostředí zvolte podle [návodu pro Android](https://kivy.org/doc/stable/guide/packaging-android.html); na Windows obvykle pracujete přes WSL, linuxové prostředí pro Windows. iOS používá **kivy-ios**, macOS a Xcode s příslušnými nástroji Apple, viz [návod pro iOS](https://kivy.org/doc/stable/guide/packaging-ios.html). Mobilní balíček, podpis a distribuce jsou samostatné kroky; desktopové `run()` je nenahradí.

## 4. Časté chyby :id=_4-common-mistakes

- **Očekávání nativních prvků a stejného vzhledu všude.** Kivy má vlastní vykreslování; ověřte čitelnost i ovládání na cílové obrazovce.
- **Výpočty ve `build()` nebo obsluze tlačítka.** Po dobu výpočtu se neobsluhují vstupy ani překreslování.
- **Změna běžné proměnné místo propojené Property.** Datový stav a zobrazení se mohou rozejít; buď použijte vazbu, nebo text explicitně aktualizujte.
- **Pevné souřadnice odvozené od desktopového okna.** Kivy má počátek souřadnic vlevo dole. Layouty a `dp` usnadní přizpůsobení, ale samy nevyřeší každou velikost displeje.

<details>
<summary>Volitelné podrobnosti: deklarativní jazyk KV</summary>

Jazyk KV popisuje strom widgetů a vazby vlastností v souboru `.kv`, zatímco Python obsahuje chování. `App` může podle svého názvu automaticky hledat odpovídající soubor KV; proto může náhodně ponechaný soubor změnit načítané rozhraní. Pro první program stačí Python. Až rozhraní poroste, přesuňte do KV strukturu a vazby a jasně určete, který soubor se načítá. Nemíchejte dvě konkurenční definice téhož rozhraní.

</details>

## Související témata

- [Tkinter](Tkinter.md) — základ desktopové smyčky událostí.
- [PyQt / PySide](PyQt_PySide.md) — Qt Widgets a signály.
- [GUI architektura](GUI_architektura.md) — služby, stav a život aplikace.
