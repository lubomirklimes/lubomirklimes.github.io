# GUI architektura

Udržovatelné grafické uživatelské rozhraní (GUI) odděluje to, **co aplikace dělá**, od toho, **jak to zobrazuje**. Není potřeba začínat rozsáhlým frameworkem. I malému formuláři pomůže čistá funkce pro pravidla, jasný stav a krátká obsluha tlačítka.

## 1. Princip :id=_1-concept

- **Pohled** obsahuje widgety, čte vstup a zobrazuje výsledek.
- **Stav** uchovává údaje, které má aplikace právě zobrazovat: výsledek, počet dokončených operací nebo informaci o rozpracované úloze.
- **Aplikační logika** rozhoduje, zda vstup dává smysl a co má příkaz udělat. Kliknutí je událost; příkaz „vytvoř pozdrav“ je její význam pro aplikaci.
- **Služby** obstarávají například soubory nebo síťové požadavky. Pohled nemusí znát jejich technické podrobnosti.

V malé aplikaci může obsluha tlačítka zároveň zprostředkovat volání logiky a aktualizaci stavu. Složitější aplikace tuto odpovědnost vyčlení. Pro porovnání se používají tři příbuzné, ale odlišné vzory:

| Vzor | Rozdělení odpovědností | Kde dává smysl |
|---|---|---|
| MVC — Model–View–Controller | Model drží data a pravidla, controller zpracuje akci, pohled zobrazí výsledek. | Výslovné řízení vstupních operací. |
| MVP — Model–View–Presenter | Presenter obslouží akci a řekne pohledu, co zobrazit. | Tkinter, Qt Widgets. |
| MVVM — Model–View–ViewModel | ViewModel nabízí stav a příkazy; vazby přenášejí změny do pohledu. | Kivy Properties/KV, Qt Quick/QML. |

MVP je přirozené tam, kde hodnoty widgetů nastavujete výslovně; presenter lze ověřovat bez skutečného okna. Kivy a Qt Quick poskytují mechanismy vazeb pro MVVM, zatímco Tkinter a Qt Widgets obvykle vyžadují více ruční synchronizace či další vrstvu. Qt model/view odděluje například data tabulky od jejího zobrazení; nejde automaticky o úplnou MVC architekturu celé aplikace.

Jde o pomůcky pro rozdělení kódu, ne povinné šablony ani totožné mechanismy. MVVM samo nevytvoří automatické obousměrné vazby. Pro několik polí často stačí jednoduchá varianta podobná MVP; nevytvářejte třídu a rozhraní pro každý řádek programu.

## 2. Příklad :id=_2-example

**Vícesouborový příklad — Tkinter:** použijte Python 3.12 nebo novější, dostupné Tcl/Tk a grafickou plochu podle [kapitoly Tkinter](Tkinter.md). Ze složky projektu s `.venv` vytvořte vedle sebe dva soubory:

```text
projekt/
├── .venv/
├── greeting_logic.py
└── greeting_app.py
```

`greeting_logic.py` — pravidla a stav, bez importu GUI:

```python
from dataclasses import dataclass


def make_greeting(raw_name: str) -> str:
    name = raw_name.strip()
    if not name:
        raise ValueError("Zadejte neprázdné jméno.")
    if len(name) > 40:
        raise ValueError("Jméno smí mít nejvýše 40 znaků.")
    return f"Ahoj, {name}!"


@dataclass
class GreetingState:
    message: str = "Zadejte jméno a zvolte Pozdravit."
    successes: int = 0
```

`@dataclass` doplní například inicializaci atributů; každá instance představuje vlastní stav. Samotná funkce `make_greeting` jen přijme text a vrátí zprávu, případně vyvolá konkrétní chybu.

`greeting_app.py` — propojení widgetů s pravidly:

```python
import tkinter as tk
from tkinter import ttk
from greeting_logic import GreetingState, make_greeting


class GreetingView(ttk.Frame):
    def __init__(self, root, make_message):
        super().__init__(root, padding=16)
        self.make_message = make_message
        self.model = GreetingState()
        self.name = tk.StringVar(master=root)
        self.message = tk.StringVar(master=root)
        self.total = tk.StringVar(master=root)
        self.grid(sticky="nsew")
        self.columnconfigure(1, weight=1)

        ttk.Label(self, text="Jméno:").grid(row=0, column=0, padx=(0, 8))
        self.entry = ttk.Entry(self, textvariable=self.name)
        self.entry.grid(row=0, column=1, sticky="ew")
        ttk.Button(self, text="Pozdravit", command=self.submit).grid(row=1, column=0, pady=12)
        ttk.Button(self, text="Vymazat", command=self.clear).grid(row=1, column=1, sticky="e")
        ttk.Label(self, textvariable=self.message, wraplength=340).grid(row=2, column=0, columnspan=2, sticky="w")
        ttk.Label(self, textvariable=self.total).grid(row=3, column=0, columnspan=2, sticky="w", pady=(8, 0))
        self.entry.bind("<Return>", lambda event: self.submit())
        self.render()
        self.entry.focus_set()

    def submit(self):
        try:
            message = self.make_message(self.name.get())
        except ValueError as error:
            message = str(error)
            self.entry.focus_set()
        else:
            self.model.successes += 1
        self.model.message = message
        self.render()

    def render(self):
        self.message.set(self.model.message)
        self.total.set(f"Úspěšné pozdravy: {self.model.successes}")

    def clear(self):
        self.model = GreetingState()
        self.name.set("")
        self.render()
        self.entry.focus_set()


def main():
    root = tk.Tk()
    root.title("Pozdravy — oddělená logika")
    root.minsize(380, 180)
    root.columnconfigure(0, weight=1)
    root.rowconfigure(0, weight=1)
    GreetingView(root, make_greeting)
    root.protocol("WM_DELETE_WINDOW", root.destroy)
    root.mainloop()


if __name__ == "__main__":
    main()
```

Z adresáře `projekt` spusťte na Windows `.\.venv\Scripts\python.exe greeting_app.py`, na macOS/Linux `.venv/bin/python greeting_app.py`. Balíček z pip není potřeba; oba soubory musí zůstat vedle sebe.

### Očekávané chování a tok dat

Okno začíná zprávou s pokynem a počtem `Úspěšné pozdravy: 0`. Prázdný vstup a **Pozdravit** zobrazí chybu, počet zůstane nula. Zadejte ` Ada ` a potvrďte tlačítkem nebo Enterem v poli: objeví se `Ahoj, Ada!` a počet 1. Každé další úspěšné potvrzení přidá jeden pozdrav. Jméno delší než 40 znaků se odmítne bez zvýšení počtu. **Vymazat** obnoví prázdný vstup, výchozí zprávu i nulový počet. Křížek aplikaci zavře.

Tok je **událost → přečtení vstupu → pravidla → změna stavu → render**. Metoda `render()` přenáší stav do výstupních widgetů na jediném místě. Text vstupního pole zůstává rozepsaným vstupem až do potvrzení; neudržujeme jeho druhou nezávislou kopii ve stavu.

Předání funkce `make_greeting` do `GreetingView` je jednoduché **vkládání závislosti**: pohled dostane službu od volajícího, místo aby ji uvnitř hledal nebo vytvářel. Není potřeba speciální kontejner. Pravidla lze volat i bez okna, například z jiného programu; automatické testy mohou samostatně kontrolovat prázdný vstup, ořezání mezer a délkovou hranici.

## 3. Kdy použít :id=_3-when-to-use

Oddělení se vyplatí, když pravidla používá více obrazovek, data přicházejí ze služby nebo změna widgetů nemá změnit výpočet. Malá ukázka záměrně používá jednu funkci a jeden stav; další vrstvy přidávejte podle odpovědností, ne podle počtu návrhových vzorů.

### Odezva, chyby a zrušení

Krátká obsluha může pravidla zavolat přímo. Delší práci rozdělte do služby mimo vlákno GUI; callback pouze přečte vstup a zahájí úlohu. Výsledek doručte mechanismem dané knihovny: fronta čtená přes Tkinter `after()`, signál Qt do GUI nebo Kivy `Clock`. Widgety mění jen GUI vlákno. Práce s widgety není automaticky bezpečná jen proto, že jste použili `async` nebo vlákno.

Pro běžící úlohu udržujte jednoznačný stav, například „připraveno / běží / ruší se“. Během práce zakažte opakované odeslání nebo výsledky označujte identifikátorem úlohy, aby starší odpověď nepřepsala novější vstup. Zrušení je žádost: pracovní kód musí kontrolovat příznak a blokující přenosy mají mít časový limit. Již provedený zápis do souboru nebo odeslaný požadavek se zrušením sám nevrátí zpět.

Při zavírání přestaňte přijímat nové akce, zrušte plánované callbacky a vyžádejte zastavení vlastní práce. Po dokončení zavřete služby a okno; nepoužívejte neomezené čekání ve vlákně GUI. Zobrazená aplikace vlastní jen widgety, žádné pozadí ani soubory; proto jí stačí `destroy()`.

Očekávané chyby vstupu zobrazte u formuláře a zachovejte text k opravě. Neočekávané selhání služby zaznamenejte přes [logování](../C/Logging.md) a uživateli ukažte srozumitelnou zprávu; neposílejte do ní tokeny nebo interní traceback. `except Exception` kolem celé aplikace může schovat programátorskou chybu. Zde zachytáváme pouze validační `ValueError`.

## 4. Časté chyby :id=_4-common-mistakes

- **Pravidla v každém callbacku znovu.** Přesuňte společný výpočet do funkce nebo služby a pohled nechte zobrazovat výsledek.
- **Dva zdroje pravdy.** Ruční změna textu widgetu bez změny aplikačního stavu vede při dalším překreslení ke ztrátě změny. Výstupy aktualizujte přes jednotný render nebo jasné vazby.
- **Skryté globální služby.** Předávejte potřebné závislosti při sestavení aplikace; jejich vytvoření i zavření má mít zřejmé místo.
- **Předčasná složitost.** Samotné počítadlo nepotřebuje univerzální sběrnici událostí, databázi ani hierarchii controllerů. Přidejte vrstvu až s konkrétním problémem.

<details>
<summary>Volitelné podrobnosti: oddělený presenter</summary>

Pokud začne `submit()` koordinovat více služeb, lze jej přesunout do presenteru, který dostane službu a malé rozhraní pohledu, například „zobraz chybu“ a „zobraz výsledek“. Presenter nemusí importovat toolkit a lze jej zkoušet s jednoduchou náhradou pohledu. U MVVM by obdobnou roli nesl ViewModel se stavem a příkazy; přenos jeho změn do widgetů musí mít konkrétní mechanismus vazeb. Název vrstvy nenahradí pravidla toku dat a úklidu.

</details>

## Související témata

- [Tkinter](Tkinter.md) — rodiče widgetů, `after()` a smyčka událostí.
- [PyQt / PySide](PyQt_PySide.md) — signály, sloty a vlastnictví objektů.
- [Kivy](Kivy.md) — Property, `bind()` a plánování přes Clock.
- [Třídy a objekty](../B/Tridy_a_objekty.md) — stav a předávání chování mezi objekty.
