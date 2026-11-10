# Funkce

Funkce pojmenuje část výpočtu, přijme vstupy a vrátí výsledek. Díky tomu lze stejnou logiku volat z více míst a testovat ji odděleně od vstupu a výstupu. Ukázky jsou samostatné soubory `.py` a spouštějí se interpretem prostředí z [úvodu](Uvod_do_Pythonu.md).

## 1. Princip :id=_1-concept

Funkce se definuje příkazem `def`. **Parametr** je jméno v definici funkce, **argument** je hodnota předaná při volání. `return hodnota` funkci ukončí a vrátí výsledek volajícímu; funkce bez `return` vrací `None`.

- **Poziční argument** se přiřadí podle pořadí: `final_price(1000)` dosadí `1000` do `price`.
- **Pojmenovaný argument** (keyword argument) se přiřadí podle jména: `final_price(1000, discount=0.15)`. Pořadí pojmenovaných argumentů nehraje roli, ale musí následovat až za pozičními.
- **Výchozí hodnota** (`tax: float = 0.21`) se použije, když argument při volání chybí. Vyhodnotí se jen jednou, při definici funkce.

Zápisy `price: float` a `-> float` jsou typové anotace. Usnadňují čtení a statickou kontrolu, ale interpret je za běhu nevynucuje.

## 2. Příklad :id=_2-example

**Samostatný příklad** `ceny.py`. Sazby se zadávají jako podíl (`0.21` = 21 %), všechny částky jsou v jedné měně:

```python
def final_price(price: float, tax: float = 0.21, discount: float = 0.0) -> float:
    """Vrátí cenu po slevě včetně daně."""
    discounted = price * (1 - discount)
    return discounted * (1 + tax)


basic = final_price(1000)
promo = final_price(1000, discount=0.15)
custom = final_price(1000, tax=0.12, discount=0.10)

print(f"Základní cena: {basic:.2f}")
print(f"Akční cena: {promo:.2f}")
print(f"Vlastní sazby: {custom:.2f}")
print(f"Uložená hodnota: {custom!r}")
```

Výstup:

```text
Základní cena: 1210.00
Akční cena: 1028.50
Vlastní sazby: 1008.00
Uložená hodnota: 1008.0000000000001
```

`!r` používá `repr()` a ukáže uloženou hodnotu bez formátu `:.2f`; více v [práci s řetězci](Prace_se_stringy.md). Sleva se uplatní před daní: 1000 × 0,85 × 1,21 = 1028,50. Poslední řádek ukazuje, že `float` je binární číslo: hodnoty jako `0.1` nebo `1.12` neumí uložit přesně a malá odchylka se projeví, jakmile výsledek nezaokrouhlíte. F-řetězec s formátem `:.2f` zobrazí dvě desetinná místa: zaokrouhluje jen zobrazení, uložená hodnota zůstává nepřesná. Funkce také nekontroluje rozsah: `discount=1.5` vrátí zápornou cenu. Skutečný kód by měl neplatnou sazbu odmítnout, například výjimkou `ValueError`.

**Peněžní částky: `float` jen pro ilustraci.** Pro přesné desítkové výpočty je ve standardní knihovně [`decimal.Decimal`](https://docs.python.org/3.12/library/decimal.html). Hodnoty vytvářejte z textu a zaokrouhlení zapište výslovně. **Samostatný příklad** `ceny_decimal.py`:

```python
from decimal import ROUND_HALF_UP, Decimal

CENTS = Decimal("0.01")


def final_price(
    price: Decimal, tax: Decimal = Decimal("0.21"), discount: Decimal = Decimal("0")
) -> Decimal:
    gross = price * (1 - discount) * (1 + tax)
    return gross.quantize(CENTS, rounding=ROUND_HALF_UP)


print(final_price(Decimal("1000"), tax=Decimal("0.12"), discount=Decimal("0.10")))
print(final_price(Decimal("19.99")))
```

Výstup je `1008.00` a `24.19` (19,99 × 1,21 = 24,1879). `Decimal(0.1)` by převzal binární nepřesnost `float`, proto `Decimal("0.1")`. Kdy a jak zaokrouhlovat (po položkách, nebo za celý doklad) určují obchodní a daňová pravidla, ne Python.

## 3. Kdy použít :id=_3-when-to-use

- Stejná logika se opakuje na více místech nebo má samostatný, pojmenovatelný účel.
- Výpočet chcete oddělit od `input()` a `print()`: funkce s `return` jde otestovat bez konzole.
- Funkce má více číselných parametrů. Pojmenované argumenty (`tax=0.12, discount=0.10`) pak brání záměně pořadí.

## 4. Časté chyby :id=_4-common-mistakes

- **`print` místo `return`.** Funkce, která výsledek jen vypíše, vrací `None`, takže `total = show_price(1000)` nedostane číslo.
- **Prohozené poziční argumenty.** `final_price(1000, 0.10, 0.12)` proběhne bez chyby, ale s daní 10 % a slevou 12 %. U podobných parametrů volte pojmenované argumenty.
- **Měnitelná výchozí hodnota.** U `def add(item, items=[])` sdílejí všechna volání tentýž seznam, protože výchozí hodnota vznikla jednou: `add("a")` a pak `add("b")` vrátí `['a', 'b']`. Použijte `items=None` a nový seznam vytvořte uvnitř funkce.
- **`float` pro peníze.** Viz poznámka u příkladu.
- **Příliš mnoho odpovědností.** Funkce, která načítá vstup, počítá i vypisuje, se špatně testuje i mění.

<details>
<summary>Volitelné podrobnosti: Argumenty pouze podle jména</summary>

Hvězdička v seznamu parametrů vynutí, že následující parametry lze předat jen jménem:

```python
def final_price(price: float, *, tax: float = 0.21, discount: float = 0.0) -> float:
    return price * (1 - discount) * (1 + tax)
```

Volání `final_price(1000, tax=0.12)` funguje, `final_price(1000, 0.12)` vyvolá `TypeError: final_price() takes 1 positional argument but 2 were given`. Proměnný počet argumentů (`*args`, `**kwargs`) a další techniky popisuje kapitola [Pokročilé funkce](../B/Pokrocile_funkce.md).

</details>

**Související témata:** [Pokročilé funkce](../B/Pokrocile_funkce.md), [Typování v Pythonu](../B/Typovani_v_Pythonu.md).
