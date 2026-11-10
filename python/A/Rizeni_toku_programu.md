# Řízení toku programu

Podmínky vybírají, která část kódu se provede; smyčky ji opakují. Ukázky jsou samostatné soubory `.py` a spouštějí se interpretem prostředí z [úvodu](Uvod_do_Pythonu.md).

## 1. Princip :id=_1-concept

**Blok** kódu v Pythonu určuje odsazení (konvence jsou čtyři mezery), ne složené závorky. Řádek s `if`, `for` nebo `while` končí dvojtečkou a vše odsazené pod ním patří do bloku.

`if` / `elif` / `else` vyhodnocuje podmínky shora dolů a provede **první** větev, jejíž podmínka platí; ostatní přeskočí. Podmínka nemusí být `bool`: `0`, `""`, `None` a prázdné kolekce se chovají jako nepravda, ostatní hodnoty jako pravda. Proto `if items:` znamená „seznam není prázdný“.

**Iterovatelný objekt** (iterable) je hodnota, ze které lze postupně získávat prvky: `list`, `tuple`, `str` (po znacích), `dict` (po klíčích), `set`, `range` nebo otevřený textový soubor (po řádcích). Smyčka `for prvek in objekt:` vezme prvky jeden po druhém a počet průchodů tak určují data. `range(stop)` vydává čísla `0` až `stop - 1`, `range(start, stop)` čísla od `start` do `stop - 1`.

`while podmínka:` opakuje blok, dokud podmínka platí. Tělo smyčky musí stav podmínky měnit, jinak smyčka neskončí.

| Příkaz | Účinek |
|---|---|
| `break` | okamžitě ukončí nejbližší obklopující smyčku |
| `continue` | přeskočí zbytek aktuálního průchodu a pokračuje dalším prvkem |
| `pass` | nedělá nic; vyplní blok, který syntaxe vyžaduje, ale zatím nemá obsah |

## 2. Příklad :id=_2-example

**Samostatný příklad** `tok.py`:

```python
numbers = [3, 7, 0, 9, 12, 5]

for n in numbers:
    if n == 0:
        continue
    if n > 10:
        print(f"Číslo {n} je větší než 10, smyčka končí.")
        break
    print(f"Zpracovávám: {n}")

remaining = 3
while remaining > 0:
    print(f"Zbývající pokusy: {remaining}")
    remaining -= 1

for position, name in enumerate(["Ada", "Bára"], start=1):
    print(f"{position}. {name}")
```

Výstup:

```text
Zpracovávám: 3
Zpracovávám: 7
Zpracovávám: 9
Číslo 12 je větší než 10, smyčka končí.
Zbývající pokusy: 3
Zbývající pokusy: 2
Zbývající pokusy: 1
1. Ada
2. Bára
```

Nula se nevypíše, protože ji `continue` přeskočí. Číslo `5` se nezpracuje vůbec: `break` u čísla `12` ukončil celou smyčku. `enumerate()` dodá k prvku i jeho pořadí, takže není nutné ručně indexovat.

`pass` vyplní záměrně prázdný blok. **Samostatný příklad:**

```python
ready = False
if ready:
    pass  # Zpracování doplníme později.
print("Program pokračuje.")
```

Výstup je `Program pokračuje.` Příkaz `pass` neukončí smyčku ani neohlásí chybu.

## 3. Kdy použít :id=_3-when-to-use

- `for` pro průchod známými daty nebo pevný počet opakování (`for _ in range(3):`).
- `while`, když počet opakování předem neznáte – například opakovaný dotaz, dokud uživatel nezadá platné číslo.
- `if` / `elif` / `else` pro výběr z několika vzájemně se vylučujících případů. Pro rozlišování podle tvaru dat nabízí Python od verze 3.10 také příkaz `match`.

## 4. Časté chyby :id=_4-common-mistakes

- **Nekonečná smyčka.** Ve `while` chybí změna stavu (`remaining -= 1`). Běžící program v konzoli přerušíte klávesami Ctrl+C.
- **`break` ve vnořené smyčce.** Ukončí jen nejbližší smyčku, vnější pokračuje. Pro opuštění obou bývá čitelnější přesunout smyčky do funkce a použít `return`.
- **Mazání z procházeného seznamu.** Smyčka `for n in nums:` s podmínkou `if n == 2:` a v ní `nums.remove(n)` přeskakuje prvky: ze `[1, 2, 2, 3]` po odstranění dvojek zbude `[1, 2, 3]`. Vytvořte nový seznam, například `[n for n in nums if n != 2]`.
- **Ruční indexování.** `for i in range(len(items)):` a `items[i]` je zbytečné, když index nepotřebujete; použijte `for item in items` nebo `enumerate(items)`.
- **`pass` místo ošetření chyby.** `except ValueError: pass` chybu tiše zahodí a program pokračuje s neplatným stavem.

<details>
<summary>Volitelné podrobnosti: Větev else u smyček</summary>

Smyčky `for` a `while` mohou mít větev `else`. Provede se, když smyčka doběhne **bez** `break` – typicky jako „nenalezeno“ při hledání:

```python
for n in [3, 7, 9]:
    if n % 2 == 0:
        print(f"První sudé číslo: {n}")
        break
else:
    print("Žádné sudé číslo.")
```

Tento kód vypíše `Žádné sudé číslo.` Konstrukce je méně známá, proto ji používejte jen tam, kde zjednoduší kód.

</details>

**Související témata:** [Generátory a iterátory](../B/Generatory_a_iteratory.md), [Výjimky a jejich zpracování](../B/Vyjimky_a_error_handling.md).
