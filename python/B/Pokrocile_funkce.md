# Pokročilé funkce

Funkce je objekt: lze ji přiřadit proměnné, předat jako argument nebo vrátit z jiné funkce. Tato kapitola rozšiřuje [základy funkcí](../A/Funkce.md) o uzávěry, dekorátory a pravidla předávání argumentů.

## Princip :id=_1-concept

`lambda` vytváří anonymní funkci s jediným výrazem; hodí se například jako krátký klíč pro `sorted()`. Pro složitější rozhodování použijte pojmenovanou funkci `def`.

Uzávěr (closure) je funkce, která používá proměnné z obklopující funkce i po skončení jejího volání. Uchovává vazby na proměnné, nikoli automaticky kopie jejich tehdejších hodnot. Při přepisování takové proměnné uvnitř vnořené funkce je potřeba `nonlocal`; čtení ani změna obsahu sdíleného seznamu jej nevyžadují.

Dekorátor dostane funkci a vrátí náhradu. `@decorate` nad `def add` odpovídá následnému `add = decorate(add)`; dekorátor se aplikuje při vykonání definice. Více dekorátorů se aplikuje zdola nahoru. Obal musí předat argumenty, návratovou hodnotu i případné výjimky beze změny způsobu volání původní funkce.

`*args` v definici sbírá poziční argumenty do n-tice, `**kwargs` pojmenované do slovníku. Ve volání je naopak rozbalí a předá dál.

## Příklady :id=_2-example

**Samostatný příklad:** řazení, uzávěr a dekorátor. Výstup obsahuje pořadí banán/jablko/hruška, hodnotu `21`, zprávu `Volání add` a součet `7`. Dekorátor nevypisuje argumenty; ty mohou obsahovat osobní údaje nebo tokeny.

```python
from functools import wraps

items = [("jablko", 25), ("hruška", 30), ("banán", 20)]
print(sorted(items, key=lambda item: item[1]))

def make_multiplier(factor):
    def multiply(value):
        return value * factor
    return multiply

def log_call(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        print(f"Volání {func.__name__}")
        return func(*args, **kwargs)
    return wrapper

@log_call
def add(a, b):
    """Vrátí součet dvou čísel."""
    return a + b

triple = make_multiplier(3)
print(triple(7))
print(add(2, 5))
```

Výstup:

```text
[('banán', 20), ('jablko', 25), ('hruška', 30)]
21
Volání add
7
```

`wraps` přenáší metadata a přidává `__wrapped__`, přes který umí nástroje dohledat původní funkci. Nemění skutečné parametry obalu `*args, **kwargs`.

**Samostatný příklad:** `/` vymezuje parametry předávané pouze pozičně, `*` parametry předávané pouze jménem. `None` umožní pro každé volání vytvořit nový seznam.

```python
def collect(value: str, /, *, items: list[str] | None = None) -> list[str]:
    if items is None:
        items = []
    items.append(value)
    return items

print(collect("a"))
print(collect("b"))
existing = ["x"]
print(collect("y", items=existing))
try:
    collect(value="a")
except TypeError as error:
    print(f"TypeError: {error}")
```

Výstup:

```text
['a']
['b']
['x', 'y']
TypeError: collect() got some positional-only arguments passed as keyword arguments: 'value'
```

## Kdy použít :id=_3-when-to-use

Uzávěr se hodí pro malé parametrizované chování, například násobič či validační pravidlo. Pokud stav vyžaduje více metod a jasný životní cyklus, bývá přehlednější objekt. Dekorátor využijte pro opakované chování kolem volání; musí být zřejmé, zda mění výsledek, zachytává chybu nebo provádí vedlejší účinek.

Signatura, tedy seznam parametrů a návratový typ, je součástí rozhraní funkce: parametry pouze jménem pomáhají zpřehlednit přepínače, parametry pouze pozičně umožňují měnit interní jméno bez změny způsobu volání. `*args` sbírá další poziční argumenty do tuple a `**kwargs` pojmenované do slovníku; nepoužívejte je bez potřeby místo konkrétních parametrů.

## Časté chyby :id=_4-common-mistakes

Výchozí hodnoty se vyhodnotí jednou při definici funkce. Výchozí `items=[]` proto sdílí stejný seznam mezi voláními. Rozlišení `is None` také respektuje úmyslně předaný prázdný seznam.

Funkce vytvořené ve smyčce čtou uzavřenou proměnnou až při svém volání (late binding). Nejde o zvláštnost `lambda`; stejně funguje `def`. Vytvořte samostatný uzávěr tovární funkcí nebo zachyťte hodnotu výchozím argumentem.

<details>
<summary>Volitelné podrobnosti: zachycení hodnoty ve smyčce</summary>

**Samostatný příklad:** první seznam funkcí sdílí vazbu na `i`; druhý ukládá tehdejší číslo do výchozího argumentu.

```python
late = [lambda: i for i in range(3)]
bound = [lambda i=i: i for i in range(3)]
print([f() for f in late])
print([f() for f in bound])
```

Výstup:

```text
[2, 2, 2]
[0, 1, 2]
```

Výchozí argument drží odkaz na objekt. U měnitelného objektu tím nevznikne jeho nezávislá kopie.

</details>

<details>
<summary>Volitelné podrobnosti: typovaný dekorátor</summary>

Po přečtení [typování](Typovani_v_Pythonu.md): `ParamSpec` propojí parametry obalu s původní funkcí, `TypeVar` jejich návratový typ. **Fragment — definice dekorátoru:**

```python
from collections.abc import Callable
from functools import wraps
from typing import ParamSpec, TypeVar

P = ParamSpec("P")
R = TypeVar("R")

def log_call(func: Callable[P, R]) -> Callable[P, R]:
    @wraps(func)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        print(f"Volání {func.__name__}")
        return func(*args, **kwargs)
    return wrapper
```

</details>

## Související témata

- [Generátory a iterátory](Generatory_a_iteratory.md) — funkce s `yield`.
- [Typování v Pythonu](Typovani_v_Pythonu.md) — pravidla rozhraní `Callable` a běhová validace.
