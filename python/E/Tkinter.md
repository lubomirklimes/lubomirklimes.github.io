# Tkinter

Tkinter propojuje Python s knihovnou Tcl/Tk pro grafická uživatelská rozhraní (GUI). Tcl je skriptovací jazyk a Tk knihovna oken a widgetů; při používání Tkinteru píšete pouze Python. Hodí se na menší desktopové nástroje, formuláře a prototypy. Modul `ttk` nabízí tematické ovládací prvky, tedy widgety, například tlačítka a vstupní pole. Pro rozsáhlé tabulky a složitější aplikace zvažte také [Qt](PyQt_PySide.md).

## 1. Princip :id=_1-concept

GUI je řízené událostmi: kliknutí nebo klávesa vyvolá obslužnou funkci, **callback**. Smyčka událostí zpracovává vstup, překreslování a naplánované akce. `tk.Tk()` vytvoří hlavní okno a propojení s Tcl/Tk; `mainloop()` spustí tuto smyčku.

Každý widget dostane rodiče, například `ttk.Entry(frame)`. Rodič určuje, do kterého stromu prvků widget patří; zničení rodiče odstraní i jeho potomky. Rozmístění řeší správce rozložení. Níže používáme jen `grid()`, který pracuje s řádky a sloupci.

### Příprava prostředí

Použijte Python 3.12 nebo novější a prostředí `.venv` podle [úvodu](../A/Uvod_do_Pythonu.md). Potřebujete běžící grafickou plochu, nikoli pouze vzdálenou konzoli bez přístupu k obrazovce. Tkinter je ve standardní knihovně, ale instalace Pythonu musí obsahovat i Tcl/Tk a modul `_tkinter`; dostupnost závisí na distribuci.

V terminálu ve složce projektu ověřte instalaci. Windows PowerShell:

```powershell
.\.venv\Scripts\python.exe -m tkinter
```

macOS/Linux:

```bash
.venv/bin/python -m tkinter
```

Otevře se malé okno s údaji o Tcl/Tk; zavřete je před pokračováním. `pip install tkinter` není způsob instalace. U instalátorů z python.org na Windows/macOS bývá Tcl/Tk součástí nabídky; u Linuxu může být nutný systémový balíček, například Debian/Ubuntu `python3-tk` pro odpovídající systémový Python. Vlastní sestavení Pythonu může vyžadovat jiný postup. Viz [oficiální dokumentace Tkinteru](https://docs.python.org/3/library/tkinter.html).

## 2. Příklad :id=_2-example

**Samostatný příklad:** uložte jako `greeting_tk.py` v UTF-8. Žádné další soubory nejsou potřeba.

```python
import tkinter as tk
from tkinter import ttk


def build_window() -> tk.Tk:
    root = tk.Tk()
    root.title("Pozdrav — Tkinter")
    root.minsize(360, 200)
    root.columnconfigure(0, weight=1)
    root.rowconfigure(0, weight=1)

    name = tk.StringVar(master=root)
    message = tk.StringVar(master=root, value="Zadejte jméno a zvolte Pozdravit.")
    status = tk.StringVar(master=root, value="Připraveno")
    pending = None

    def clear_status():
        nonlocal pending
        pending = None
        status.set("Připraveno")

    def greet():
        nonlocal pending
        if pending is not None:
            root.after_cancel(pending)
            pending = None
        value = name.get().strip()
        if not value:
            message.set("Zadejte neprázdné jméno.")
            status.set("Doplňte jméno.")
            entry.focus_set()
            return
        message.set(f"Ahoj, {value}!")
        status.set("Pozdrav vytvořen")
        pending = root.after(1500, clear_status)

    def close():
        if pending is not None:
            root.after_cancel(pending)
        root.destroy()

    frame = ttk.Frame(root, padding=16)
    frame.grid(row=0, column=0, sticky="nsew")
    frame.columnconfigure(1, weight=1)
    ttk.Label(frame, text="Jméno:").grid(row=0, column=0, padx=(0, 8))
    entry = ttk.Entry(frame, textvariable=name)
    entry.grid(row=0, column=1, sticky="ew")
    ttk.Button(frame, text="Pozdravit", command=greet).grid(row=1, column=0, pady=12)
    ttk.Button(frame, text="Zavřít", command=close).grid(row=1, column=1, sticky="e")
    ttk.Label(frame, textvariable=message, wraplength=320).grid(row=2, column=0, columnspan=2, sticky="w")
    ttk.Label(frame, textvariable=status).grid(row=3, column=0, columnspan=2, sticky="w", pady=(8, 0))
    entry.focus_set()
    root.bind("<Return>", lambda event: greet())
    root.protocol("WM_DELETE_WINDOW", close)
    return root


if __name__ == "__main__":
    build_window().mainloop()
```

Spusťte ze stejné složky na Windows `.\.venv\Scripts\python.exe greeting_tk.py`, na macOS/Linux `.venv/bin/python greeting_tk.py`.

### Co se objeví a co vyzkoušet

Okno **Pozdrav — Tkinter** obsahuje popisek Jméno, vstupní pole, dvě tlačítka, zprávu a stav. Prázdné pole a **Pozdravit** zobrazí `Zadejte neprázdné jméno.` a vrátí zaměření klávesnice do pole. Napište `Ada` a stiskněte Enter nebo klikněte na **Pozdravit**: zpráva se změní na `Ahoj, Ada!`. Stav `Pozdrav vytvořen` se přibližně po 1,5 sekundě vrátí na `Připraveno`. Okno během čekání reaguje. **Zavřít** i křížek ukončí aplikaci.

`StringVar` uchovává text propojený s widgetem: `.get()` jej přečte, `.set()` změní i zobrazení. `command=greet` předává funkci; `command=greet()` by ji zavolalo hned při vytváření tlačítka. `weight=1` přidělí sloupci volné místo a `sticky="ew"` roztáhne pole vodorovně. Zaměření, také **focus**, určuje příjemce psaní.

## 3. Kdy použít :id=_3-when-to-use

Tkinter je praktický pro interní konfigurátory a malé nástroje, pokud je Tcl/Tk dostupné u cílových uživatelů. Instalace aplikace musí zahrnout i potřebné knihovny a data; samotný soubor `.py` nezajišťuje dostupnost Pythonu ani Tk.

Obsluhy událostí mají rychle skončit. `after(1500, callback)` naplánuje krátkou akci do stejné smyčky; nevytvoří pracovní vlákno a negarantuje přesný čas spuštění. Dlouhý výpočet, síťový přenos ani `time.sleep()` do callbacku nepatří. Pracovní vlákno může předávat výsledky přes frontu; krátká obsluha naplánovaná z GUI pomocí `after()` ji průběžně čte a teprve ona mění widgety. Pro náročný výpočet lze zvolit samostatný proces. Podrobnosti oddělení práce řeší [GUI architektura](GUI_architektura.md).

## 4. Časté chyby :id=_4-common-mistakes

- **Míchání `pack()` a `grid()` pro děti téhož rodiče.** Zvolte pro tohoto rodiče jediný správce; různé vnořené rámy mohou používat různé správce.
- **Více hlavních oken `Tk()`.** Obvykle vytvořte jedno a další okna pomocí `Toplevel`.
- **Úprava widgetů z pracovního vlákna.** Veškeré změny rozhraní ponechte vláknu, které vytvořilo okno a zpracovává jeho události.
- **Zavření okna zaměněné za zrušení práce.** `destroy()` odstraní okno, ale samo nezastaví vlastní vlákno nebo proces. Zde rušíme pouze naplánovanou stavovou zprávu; aplikace žádnou práci na pozadí nespouští.

<details>
<summary>Volitelné podrobnosti: validace při psaní</summary>

`Entry` umí validaci změn přes `validatecommand`, například povolit jen číslice. U běžného formuláře je často přehlednější kontrola po potvrzení, která dovolí i dočasně neúplný vstup. Rozlišujte syntaxi a význam: text složený z číslic může být stále mimo povolený rozsah. Chybu ukažte u vstupu, zachovejte zadaný text a umožněte opravu.

</details>

## Související témata

- [PyQt / PySide](PyQt_PySide.md) — bohatší sada desktopových prvků.
- [GUI architektura](GUI_architektura.md) — oddělení stavu a aplikační logiky.
- [Třídy a objekty](../B/Tridy_a_objekty.md) — rodičovské objekty, metody a dědičnost.
