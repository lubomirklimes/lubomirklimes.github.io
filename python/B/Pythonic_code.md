<span id="pythonic-code"></span>

# Idiomatický kód v Pythonu (Pythonic)

Idiomatický kód využívá obvyklé prostředky jazyka tak, aby byl jeho záměr snadno čitelný. Příklady lze uložit do souborů `.py` a spustit se standardní knihovnou.

## Princip :id=_1-concept

List comprehension vytvoří nový seznam: každou položku upraví a případně některé vynechá. Hodí se pro jednoduchý výraz; více kroků, ošetření chyb nebo vedlejší účinky obvykle vyjádří lépe smyčka. Vytvářet seznam jen kvůli volání `print()` či zápisu do souboru je zbytečné.

Python podporuje přímo průchod hodnotami. `enumerate()` přidá pořadové číslo, rozbalení přiřadí části dvojice jménům a `zip()` spojí odpovídající položky více vstupů. Výchozí `zip()` končí s nejkratším vstupem; pokud mají být délky stejné, použijte `strict=True` (od Pythonu 3.10). Případná chyba délky se zjistí až při průchodu výsledkem. Iterátor vydává hodnoty postupně; podrobněji v [generátorech a iterátorech](Generatory_a_iteratory.md).

## Příklady :id=_2-example

**Samostatný příklad:** comprehension a smyčka vyjadřují stejnou transformaci. Obě vypíší `[4, 16, 36]`.

```python
numbers = [1, 2, 3, 4, 5, 6]
squares_of_even = [n * n for n in numbers if n % 2 == 0]

result = []
for n in numbers:
    if n % 2 == 0:
        result.append(n * n)

print(squares_of_even)
print(result)
```

Výstup:

```text
[4, 16, 36]
[4, 16, 36]
```

**Samostatný příklad:** pořadí od jedničky, rozbalení dvojic a kontrola délek. Výstup je `1. Eva: 8`, `2. Jan: 5` a `Chyba: zip() argument 2 is shorter than argument 1`.

```python
names = ["Eva", "Jan"]
scores = [8, 5]
for position, (name, score) in enumerate(zip(names, scores, strict=True), start=1):
    print(f"{position}. {name}: {score}")
try:
    list(zip(names, [8], strict=True))
except ValueError as error:
    print(f"Chyba: {error}")
```

Výstup:

```text
1. Eva: 8
2. Jan: 5
Chyba: zip() argument 2 is shorter than argument 1
```

## Kdy který zápis zvolit :id=_3-when-to-use

- Comprehension použijte pro vytvoření kolekce; generátorový výraz pro postupné předávání hodnot například do `sum()`.
- Pro test prázdné běžné kolekce stačí `if values:`; není nutné počítat délku. Test pravdivosti však nepozná, zda je generátor vyčerpaný.
- Pro zástupnou hodnotu `None`, která označuje chybějící údaj, používejte `is None`. Zápis `value or default` nahrazuje také nulu, prázdný řetězec a další nepravdivé hodnoty, což nemusí být záměr.
- Složitější transformaci pojmenujte funkcí nebo rozepište do smyčky. Čtenář má vidět pravidlo, nikoli luštit počet zkrácených výrazů.

## Časté chyby :id=_4-common-mistakes

`sorted(values)` vrací nový seznam, zatímco `values.sort()` mění seznam na místě a vrací `None`. Přiřazení výsledku `sort()` proto seznam nenahradí seřazenou kopií. Obdobně rozlišujte změnu existujícího objektu od vytvoření nového.

Neměňte velikost seznamu nebo slovníku během průchodu tímto objektem. Filtrujte do nové kolekce, případně iterujte přes vhodnou kopii. Vyhněte se i vnořeným comprehension, jejichž pořadí průchodu není zřejmé; úspora řádků není důkaz čitelnosti.

<details>
<summary>Volitelné podrobnosti: vyhodnocení a výkon</summary>

Comprehension vytvoří seznam hned; generátorový výraz poskytuje hodnoty až na vyžádání a je jednorázový. `sum(n * n for n in range(10))` nepotřebuje pomocný seznam, ale samotný výpočet stále provede. To neznamená, že každý generátor bude rychlejší.

Výkon závisí na operaci a vstupu. Pokud na něm záleží, změřte jej; viz [Profilování](../D/Profiling.md).

</details>

## Související témata

- [Pokročilé funkce](Pokrocile_funkce.md) — pojmenování a předávání chování.
- [Generátory a iterátory](Generatory_a_iteratory.md) — jednorázovost a postupné zpracování.
