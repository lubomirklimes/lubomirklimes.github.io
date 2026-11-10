# Moduly a balíčky

Moduly rozdělují kód do samostatně importovatelných částí. Následující příklad používá pouze standardní knihovnu.

## 1. Princip :id=_1-concept

**Modul** je obvykle soubor `.py`. **Běžný balíček** je adresář s `__init__.py`, který může obsahovat moduly a další balíčky. `__init__.py` se provede při prvním importu balíčku v procesu; může zůstat prázdný nebo zpřístupnit vybraná jména.

Absolutní import `from shop import total_price` začíná názvem balíčku. Relativní import `from .pricing import total_price` používá kontext aktuálního balíčku; tečka zde znamená `shop`.

## 2. Příklad :id=_2-example

**Vícesouborový příklad.** Vytvořte tuto strukturu; každý následující blok patří do jiného souboru:

```text
projekt/
├── .venv/
├── main.py
└── shop/
    ├── __init__.py
    └── pricing.py
```

`shop/pricing.py`:

```python
def total_price(items: list[float], vat: float = 0.21) -> float:
    return sum(items) * (1 + vat)
```

`shop/__init__.py`:

```python
from .pricing import total_price
```

`main.py`:

```python
from shop import total_price

if __name__ == "__main__":
    print(f"Cena s DPH: {total_price([100.0, 250.0]):.2f}")
```

Otevřete terminál v adresáři `projekt` a přímo v něm vytvořte `.venv` postupem z [úvodu](../A/Uvod_do_Pythonu.md). Poté spusťte: na Windows `.\.venv\Scripts\python.exe main.py`, na Unixu `.venv/bin/python main.py`. Výstup: `Cena s DPH: 423.50`. Výpočet s `float` ilustruje importy; pro přesná peněžní pravidla je potřeba vhodná číselná reprezentace a zaokrouhlování.

`__name__` obsahuje při importu název modulu, při přímém spuštění hodnotu `"__main__"`. Podmínka proto spustí výpis jen při spuštění `main.py`, nikoli při jeho importu.

Importní balíček je skupina modulů používaná přes `import`. Distribuce je instalovatelný projekt pro pip; může obsahovat více importních balíčků a její název se může lišit. Dostupnost externích knihoven závisí na podporovaných verzích Pythonu a systému.

## 3. Kdy použít :id=_3-when-to-use

Oddělte například cenový výpočet od vstupu/výstupu programu, aby šel používat i testovat nezávisle. Veřejná jména exportujte z `__init__.py` záměrně; není nutné tam přesouvat implementaci.

## 4. Časté chyby :id=_4-common-mistakes

- Sloučení tří bloků do jednoho souboru nevytvoří balíček.
- Přímé spuštění `shop/__init__.py` interpretem prostředí skončí `ImportError: attempted relative import with no known parent package`. Relativní import potřebuje balíčkový kontext. Spusťte `main.py` z adresáře `projekt`.
- Cyklické importy mohou číst ještě nedokončený modul. Sdílený kód oddělte nebo zjednodušte závislosti místo náhodného přehazování importů.

<details>
<summary>Volitelné podrobnosti: Balíček bez inicializačního souboru</summary>

Jmenné balíčky (namespace packages) mohou fungovat bez `__init__.py` a spojovat části z více míst. Pro tento malý projekt je záměrně použit běžný balíček s jednoznačnou strukturou.

</details>

**Související témata:** [Práce se soubory](Prace_se_soubory.md), [CLI aplikace](../C/CLI_aplikace.md).
