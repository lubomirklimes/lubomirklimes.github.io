# PyQt / PySide

Qt nabízí rozsáhlou sadu nástrojů pro desktopové aplikace: formuláře, tabulky, nabídky i grafiku. Python jej používá prostřednictvím vazeb **PySide6** nebo **PyQt6** pro Qt 6. Oproti [Tkinteru](Tkinter.md) přináší více hotových prvků, ale také větší distribuci a další závislosti. Níže používáme výhradně PySide6 a technologii Qt Widgets.

## 1. Princip :id=_1-concept

`QApplication` spravuje aplikaci a její smyčku událostí; pro Qt Widgets vytvořte v procesu jednu instanci před vytvářením widgetů. `QWidget` je základní prvek nebo samostatné okno. `QMainWindow` se hodí, pokud potřebujete nabídky, panely nástrojů a centrální obsah. Rozložení, například `QVBoxLayout`, rozmístí prvky bez ručního zadávání jejich souřadnic.

**Signál** oznamuje událost, například `clicked` u tlačítka. `signal.connect(handler)` připojí obsluhu, které Qt říká **slot**. V Pythonu může být obsluhou metoda; `@Slot()` výslovně deklaruje její zapojení do systému Qt. Základní syntaxi tříd vysvětlují [Třídy a objekty](../B/Tridy_a_objekty.md).

### Instalace a volba vazby

Vytvořte složku projektu s `.venv` podle [úvodu](../A/Uvod_do_Pythonu.md). Použijte Python 3.12 nebo novější podporovaný vybraným vydáním balíčku a cílovým systémem. Pro běh je nutná grafická plocha. Aktuální požadavky a dostupnost předpřipravených balíčků pro procesor a systém uvádí [Qt for Python — Getting Started](https://doc.qt.io/qtforpython-6/gettingstarted.html); balíčky PySide6 již obsahují potřebné knihovny Qt.

Příkazy spouštějte v terminálu z této složky. Windows PowerShell:

```powershell
.\.venv\Scripts\python.exe -m pip install PySide6
.\.venv\Scripts\python.exe greeting_qt.py
```

macOS/Linux:

```bash
.venv/bin/python -m pip install PySide6
.venv/bin/python greeting_qt.py
```

Druhý příkaz spusťte až po uložení následujícího programu. Pokud instalace nenabízí balíček pro váš Python, vyberte podporovaný interpret; nevynucujte instalaci nekompatibilního binárního balíčku.

| Vlastnost | PySide6 | PyQt6 |
|---|---|---|
| Projekt | Qt for Python | Riverbank Computing |
| Balíček pro pip | `PySide6` | `PyQt6` |
| Import widgetů | `PySide6.QtWidgets` | `PyQt6.QtWidgets` |
| Vlastní signál / slot | `Signal`, `Slot` z `PySide6.QtCore` | `pyqtSignal`, `pyqtSlot` z `PyQt6.QtCore` |

GPL znamená GNU General Public License, LGPL GNU Lesser General Public License; přípona v3 označuje verzi licence. PySide6 má komunitní variantu s LGPLv3/GPLv3 a komerční variantu; podmínky se liší i podle použitých modulů a přibaleného kódu. PyQt6 je pod GPLv3 nebo komerční licencí Riverbank, nikoli LGPL. Při výběru a distribuci prostudujte [licence Qt for Python](https://doc.qt.io/qtforpython-6/commercial/index.html) a [licence PyQt](https://www.riverbankcomputing.com/software/pyqt/). Samotné použití stejného Qt neznamená stejné licenční podmínky vazeb.

## 2. Příklad :id=_2-example

**Samostatný příklad:** soubor `greeting_qt.py` v UTF-8, bez dalších souborů.

```python
import sys
from PySide6.QtCore import Slot
from PySide6.QtWidgets import (
    QApplication, QLabel, QLineEdit, QPushButton, QVBoxLayout, QWidget,
)


class GreetingWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Pozdrav — Qt")
        self.resize(380, 220)

        label = QLabel("&Jméno:")
        self.name = QLineEdit()
        self.name.setAccessibleName("Jméno")
        label.setBuddy(self.name)
        self.output = QLabel("Zadejte jméno a zvolte Pozdravit.")
        self.output.setWordWrap(True)
        greet = QPushButton("Pozdravit")
        close = QPushButton("Zavřít")
        greet.clicked.connect(self.say_hello)
        self.name.returnPressed.connect(self.say_hello)
        close.clicked.connect(self.close)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(10)
        for widget in (label, self.name, greet, self.output, close):
            layout.addWidget(widget)
        self.name.setFocus()

    @Slot()
    def say_hello(self):
        value = self.name.text().strip()
        if not value:
            self.output.setText("Zadejte neprázdné jméno.")
            self.name.setFocus()
            return
        self.output.setText(f"Ahoj, {value}!")


def main():
    app = QApplication(sys.argv)
    window = GreetingWindow()
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
```

### Očekávané chování

Objeví se okno **Pozdrav — Qt** s pojmenovaným polem a tlačítky. Kliknutí na **Pozdravit** s prázdným polem zobrazí `Zadejte neprázdné jméno.` a zaměří vstup. Po zadání `Ada` tlačítko nebo Enter v poli zobrazí `Ahoj, Ada!`. Změna velikosti okna přerozdělí místo podle layoutu. Tlačítko **Zavřít** nebo křížek zavře poslední okno a ukončí smyčku. Popisek s `&Jméno` při běžné desktopové konfiguraci umožňuje zaměřit pole také zkratkou Alt+J.

`show()` zobrazí okno, `app.exec()` přijímá události až do ukončení aplikace. Proměnná `window` v `main()` drží Python objekt po dobu smyčky. Layout připojený k `self` přidá widgety do rodičovského stromu Qt, který řídí jejich úklid. Vlastní síťové klienty, soubory nebo pracovní úlohy je ovšem nutné zavřít samostatně.

## 3. Kdy použít :id=_3-when-to-use

Qt Widgets je vhodné pro dlouhodobě udržované desktopové aplikace s formuláři a tabulkami. Pro animované rozhraní existuje také Qt Quick a deklarativní jazyk QML; nejsou podmínkou této ukázky. Model/view v Qt umí oddělit například data tabulky od jejich zobrazení.

Widgety používejte jen v hlavním vlákně GUI. Dlouhou operaci lze umístit do pracovního objektu `QObject` přesunutého do `QThread`; výsledek a chybu předává signály do slotů okna. Spojení mezi vlákny se správně nastavenými objekty předá obsluhu do smyčky příjemce. Samotný objekt `QThread` obvykle žije ve vlákně, které jej vytvořilo. Neaktualizujte okno přímo z pracovní funkce. Viz [Qt — vlákna a objekty](https://doc.qt.io/qt-6/threads-qobject.html).

Při zavírání vyžádejte spolupracující zrušení úlohy a dokončete úklid; `quit()` ukončuje smyčku vlákna, ale nepřeruší právě běžící blokující funkci. Čekání bez limitu v GUI může zablokovat i zavírání. Časové limity vstupně-výstupních operací a průběžná kontrola zrušení patří do samotné služby. Malá ukázka žádné pracovní vlákno nepotřebuje.

## 4. Časté chyby :id=_4-common-mistakes

- **Smíchání PySide6 a PyQt6 v jednom okně.** Vyberte jednu vazbu pro celý program; jejich objekty nejsou vzájemně zaměnitelné typy.
- **Blokující operace v obsluze signálu.** Ani rychlé vykreslování Qt nezabrání zamrznutí, když se smyčka nedostane zpět ke zpracování událostí.
- **Ruční souřadnice místo layoutů.** Výsledek pak nemusí fungovat s jiným písmem, překladem nebo škálováním obrazovky.
- **Předání jen `.py` souboru uživateli.** Distribuce potřebuje Python, knihovny Qt a jejich platformní pluginy, nebo sestavený balík pro daný systém. Balení a podepisování řešte pro každý cílový systém zvlášť.

<details>
<summary>Volitelné podrobnosti: přechod na PyQt6</summary>

Ve vlastním prostředí pro alternativu instalujte `python -m pip install PyQt6` interpretem tohoto prostředí. V tomto programu nahraďte import `Slot` za `from PyQt6.QtCore import pyqtSlot as Slot` a namespace widgetů za `PyQt6.QtWidgets`. Zbytek této malé ukázky používá společné rozhraní. Vlastní signály se v PyQt6 deklarují `pyqtSignal`, v PySide6 `Signal`. U větší aplikace porovnejte konkrétní typy, přetížené signály a vlastnictví objektů podle dokumentace obou vazeb; změna importu není obecný převodník projektu.

</details>

## Související témata

- [Tkinter](Tkinter.md) — menší aplikace se standardní knihovnou.
- [Kivy](Kivy.md) — vlastní vykreslování a dotykové ovládání.
- [GUI architektura](GUI_architektura.md) — stav, služby a zrušení práce.
