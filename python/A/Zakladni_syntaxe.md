# Základní syntaxe

Proměnné, základní datové typy a jednoduchý vstup a výstup v konzoli. Ukázky jsou samostatné soubory `.py` z [úvodu](Uvod_do_Pythonu.md) a používají jen standardní knihovnu.

## 1. Princip :id=_1-concept

**Proměnná** je v Pythonu jméno, které odkazuje na objekt. Typ nese objekt, nikoli jméno: po `x = 5` odkazuje `x` na objekt typu `int`, po následném `x = "pět"` stejné jméno odkazuje na objekt typu `str`. Tomu se říká **dynamické typování** – typ se neuvádí předem a zjišťuje se za běhu u konkrétní hodnoty.

Dynamické neznamená volné: Python typy samovolně nepřevádí. `"3" + 4` nespojí text s číslem, ale vyvolá `TypeError: can only concatenate str (not "int") to str`. Převod je nutné zapsat, například `int("3") + 4`.

| Typ | Příklad | Poznámka |
|---|---|---|
| `int` | `42`, `-7` | celé číslo, velikost omezuje jen paměť |
| `float` | `1.82` | binární číslo s plovoucí řádovou čárkou; `0.1 + 0.2` vypíše `0.30000000000000004` |
| `str` | `"Ada"` | neměnný text v Unicode (nelze ho změnit na místě) |
| `bool` | `True`, `False` | výsledek porovnání, například `age >= 18` |
| `NoneType` | `None` | „žádná hodnota“; vrací ji například funkce bez `return` |

Typ hodnoty zjistí `type(hodnota)`. `print()` vypíše hodnoty na standardní výstup. `input(výzva)` vypíše výzvu, přečte jeden řádek a vrátí ho jako `str` bez koncového odřádkování – **vždy text**, i když uživatel napíše číslice. Číslo z něj vytvoří `int(text)` nebo `float(text)`. Pokud text převést nejde, vyvolají výjimku `ValueError`.

F-řetězec `f"Věk: {age}"` vloží hodnotu výrazu do textu. Zápis `!r` použije `repr()`: u textu zobrazí i uvozovky a například `\n` místo konce řádku. `type(x).__name__` vrátí název typu hodnoty `x`. Více o formátování v [práci s řetězci](Prace_se_stringy.md).

## 2. Příklad :id=_2-example

**Samostatný příklad** `syntaxe.py`. Spusťte ho interpretem prostředí z úvodu, například `.\.venv\Scripts\python.exe syntaxe.py` ve Windows nebo `.venv/bin/python syntaxe.py` na Unixu:

```python
name = input("Jak se jmenujete? ").strip()
age_text = input("Kolik je vám let? ")

try:
    age = int(age_text)
except ValueError:
    print(f"Věk musí být celé číslo, zadáno: {age_text!r}")
else:
    is_adult = age >= 18
    print(f"Dobrý den, {name}!")
    print(f"Věk: {age}, dospělý: {is_adult}")
    print(type(name).__name__, type(age).__name__, type(is_adult).__name__)
```

Průběh při zadání `Ada` a `36`:

```text
Jak se jmenujete? Ada
Kolik je vám let? 36
Dobrý den, Ada!
Věk: 36, dospělý: True
str int bool
```

Při zadání `třicet` program místo pádu vypíše `Věk musí být celé číslo, zadáno: 'třicet'`. Blok `try` obsahuje jen převod, který může selhat; větev `else` se provede pouze po úspěšném převodu. `int()` toleruje okolní mezery a znaménko (`" 42 "`, `"+7"`), ale ne desetinné číslo (`"4.5"`).

## 3. Kdy použít :id=_3-when-to-use

- `input()` a `print()` se hodí pro malé interaktivní skripty a cvičení. Program spouštěný automaticky (plánovač úloh, automatické sestavení) má dostávat vstup z argumentů příkazového řádku nebo ze souboru; viz [CLI aplikace](../C/CLI_aplikace.md).
- `print()` je rychlá kontrola mezivýsledku. V delším programu je vhodnější [logování](../C/Logging.md), které lze filtrovat podle úrovně.
- Text ze vstupu převeďte na číslo hned po načtení. Zbytek programu pak pracuje s jedním typem a chyba vstupu se ohlásí na jednom místě.

## 4. Časté chyby :id=_4-common-mistakes

- **Počítání s textem z `input()`.** `"3" * 2` vrátí `"33"` a `"3" + 1` vyvolá `TypeError`. Převeďte hodnotu přes `int()` nebo `float()`.
- **Neošetřený převod.** `int(input())` ukončí program výjimkou `ValueError` při každém překlepu. Zachyťte konkrétně `ValueError`; holé `except:` by skrylo i nesouvisející chyby. Chcete-li se ptát znovu, dejte dotaz i převod do smyčky `while`, která skončí po platném zadání.
- **Desetinná čárka.** `float("1,82")` vyvolá `ValueError`; Python očekává tečku. České zadání lze před převodem upravit, například `text.replace(",", ".")`.
- **Konec vstupu.** Když vstup skončí (Ctrl+D na Unixu, Ctrl+Z a Enter ve Windows, prázdný přesměrovaný soubor), `input()` vyvolá `EOFError`. U interaktivního cvičení to obvykle nevadí; skript čtoucí data z jiného programu přes rouru `|` má tento stav ošetřit.
- **Jedno jméno pro různé typy.** `total = 0` a později `total = "nic"` Python dovolí, ale následný výpočet selže daleko od místa chyby. Držte pro jedno jméno jeden význam a typ.

<details>
<summary>Volitelné podrobnosti: Typové anotace</summary>

Zápis `age: int = 36` je **typová anotace** – informace pro čtenáře a nástroje. Interpret ji za běhu nekontroluje: `age: int = "třicet"` proběhne bez chyby. Nesoulad odhalí až statická kontrola, například mypy nebo Pylance (Pyright). Podrobněji v kapitole [Typování v Pythonu](../B/Typovani_v_Pythonu.md).

</details>

**Související témata:** [Výjimky a jejich zpracování](../B/Vyjimky_a_error_handling.md), [Typování v Pythonu](../B/Typovani_v_Pythonu.md).
