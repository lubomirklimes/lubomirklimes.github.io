# Typování v Pythonu

Typové anotace popisují očekávané vstupy a výsledky pro čtenáře, editor a statický analyzátor. **Python je sám nevynucuje.**

## Princip :id=_1-concept

Anotace `value: int` nepřevádí vstup na číslo ani nebrání přiřazení řetězce za běhu. Data z formuláře, souboru nebo sítě vyžadují skutečné parsování a validaci. Statický analyzátor hledá rozpory v popsaném programu, neověřuje všechny možné hodnoty externích dat.

Používejte `list[str]` a `dict[str, int]` (od 3.9), sjednocení `str | None` (od 3.10) a typy z `collections.abc`, například `Sequence`, `Iterable` a `Callable`. `Sequence[float]` vyjadřuje čtení délky a položek posloupnosti; nevyžaduje konkrétní měnitelný seznam. `Iterable[T]` slibuje možnost získat iterátor, `Iterator[T]` také postupné volání `next()`.

`TypedDict` popisuje slovník se známými klíči a typy hodnot. Zápis `class User(TypedDict):` deklaruje požadované klíče pomocí syntaxe [tříd](Tridy_a_objekty.md). Instance je za běhu obyčejný `dict`; deklarace neověří přítomnost klíčů ani jejich obsah. `Protocol` popisuje požadované operace objektu bez nutnosti dědit společnou základní třídu. Tyto dva nástroje řeší odlišné potřeby.

## Příklad a kontrola :id=_2-example

**Samostatný příklad**, uložený jako `typing_demo.py`. Průměr přijme i tuple; prázdný vstup vyvolá popsanou chybu. `TypedDict` poskytuje statický tvar, funkce `average()` navíc provádí běhovou kontrolu neprázdnosti.

```python
from collections.abc import Sequence
from typing import TypedDict

class User(TypedDict):
    name: str
    age: int

def format_user(user: User) -> str:
    return f"{user['name']} ({user['age']})"

def average(values: Sequence[float]) -> float:
    if not values:
        raise ValueError("Posloupnost nesmí být prázdná")
    return sum(values) / len(values)

user: User = {"name": "Eva", "age": 29}
print(format_user(user))
print(average((1.5, 2.5, 3.5)))

try:
    average([])
except ValueError as exc:
    print(f"Chyba: {exc}")
```

Výstup:

```text
Eva (29)
2.5
Chyba: Posloupnost nesmí být prázdná
```

Výstup je `Eva (29)`, `2.5` a `Chyba: Posloupnost nesmí být prázdná`. Funkce neověřuje, že všechny běhové hodnoty skutečně jsou čísla; tento předpoklad popisuje anotace. Pro nedůvěryhodný vstup patří konverze a validace na hranici aplikace, viz [výjimky](Vyjimky_a_error_handling.md).

**Volitelně: statická kontrola balíčkem mypy.** Uložte předchozí blok jako `typing_demo.py` do složky s `.venv` z [úvodu](../A/Uvod_do_Pythonu.md). Příkazy spouštějte z této složky.

Windows PowerShell:

```powershell
.\.venv\Scripts\python.exe -m pip install mypy
.\.venv\Scripts\python.exe -m mypy --strict typing_demo.py
```

macOS/Linux:

```bash
.venv/bin/python -m pip install mypy
.venv/bin/python -m mypy --strict typing_demo.py
```

Očekáváním pro správný soubor je úspěšná kontrola. Pokud změníte `age` na řetězec, měl by analyzátor ohlásit nesoulad s položkou `int`; samotný Python jej při vytvoření slovníku neodmítne. Přesné znění diagnostiky závisí na verzi mypy.

## Kdy použít :id=_3-when-to-use

Anotace mají největší přínos na veřejných hranicích modulů a při refaktoringu. Začněte parametry a návratovými typy; místní proměnné často odvodí analyzátor. Statickou kontrolu spouštějte opakovaně v CI (automatické průběžné kontrole projektu), ve stejném nastavení jako lokálně.

`Any` dovoluje libovolné operace bez běžné statické kontroly a může skrýt chybu dále v programu. `object` znamená libovolný objekt, s nímž jsou bez zúžení povolené jen obecně platné operace. Zúžení například pomocí `isinstance()` zároveň provádí skutečný běhový test.

## Časté chyby :id=_4-common-mistakes

`T | None` znamená, že hodnota může být `None`; neznamená, že argument lze vynechat. Volitelnost volání určuje až výchozí hodnota parametru. `typing.cast()` pouze sdělí typ analyzátoru, za běhu vrací původní objekt bez validace.

`list[Derived]` obecně není náhradou za `list[Base]`, protože příjemce by mohl do seznamu vložit jiný objekt typu `Base`. Pokud funkce kolekci pouze čte, zvažte obecnější `Sequence[Base]`. Anotace `Sequence` však nezaručuje, že se původní objekt nemění jinou cestou.

<details>
<summary>Volitelné podrobnosti: verze a generické typy</summary>

Python 3.12 přidal příkaz `type` pro typové aliasy a novou syntaxi parametrů typů. Starší zápis s `TypeVar` zůstává použitelný.

Pro dekorátor zachovávající argumenty slouží `ParamSpec` (od 3.10), pro vazbu na návratový typ `TypeVar`; úplný příklad je v [pokročilých funkcích](Pokrocile_funkce.md). Běžný `Callable[..., object]` tyto vztahy ztrácí. Podpora anotací a rozsah diagnostiky se mezi analyzátory liší; úspěch běhového testu nenahrazuje statickou kontrolu ani naopak.

</details>

## Související témata

- [Pokročilé funkce](Pokrocile_funkce.md) — typ dekorátoru.
- [Výjimky a jejich zpracování](Vyjimky_a_error_handling.md) — běhová validace.
