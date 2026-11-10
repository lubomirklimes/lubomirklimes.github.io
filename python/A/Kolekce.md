# Kolekce

Čtyři vestavěné kolekce – `list`, `tuple`, `set` a `dict` – pokrývají většinu běžné práce s více hodnotami. Liší se pořadím, měnitelností a tím, co v nich lze rychle vyhledat. Ukázky jsou samostatné soubory `.py` pro CPython 3.12 a spouštějí se interpretem prostředí z [úvodu](Uvod_do_Pythonu.md).

## 1. Princip :id=_1-concept

**Měnitelný** (mutable) objekt lze po vytvoření změnit, například přidat prvek. **Neměnný** (immutable) objekt změnit nelze; každá „úprava“ vytvoří nový objekt.

| Typ | Zápis | Pořadí prvků | Měnitelnost | Duplicity | Typické použití |
|---|---|---|---|---|---|
| `list` (seznam) | `["a", "b"]` | zachováno | měnitelný | povoleny | posloupnost položek ke zpracování |
| `tuple` (n-tice) | `(10, 20)` | zachováno | neměnný | povoleny | pevná skupina hodnot, například souřadnice |
| `set` (množina) | `{"a", "b"}`, `set()` | **negarantováno** | měnitelný | odstraněny | odstranění duplicit, test „je prvek v kolekci?“ |
| `dict` (slovník) | `{"klíč": hodnota}` | pořadí vložení | měnitelný | klíče jsou unikátní | vyhledání hodnoty podle klíče |

Neměnnost n-tice je **mělká**: n-tice pevně určuje, *které* objekty obsahuje, ale neměnné nečiní je samotné. Obsahuje-li seznam, ten lze dál měnit.

Prvek množiny a klíč slovníku musí být **hašovatelný** (hashable) – mít hodnotu `hash()`, která se po dobu jeho existence nemění. Splňují to `int`, `float`, `str`, `bool` a n-tice složené jen z hašovatelných prvků. `list`, `dict` ani `set` hašovatelné nejsou.

## 2. Příklad :id=_2-example

**Samostatný příklad** `kolekce.py`:

```python
fruits = ["jablko", "hruška", "jablko"]
fruits.append("banán")

point = (10, 20)
unique_fruits = set(fruits)
prices = {"jablko": 25, "hruška": 30}
prices["banán"] = 18

print(f"Seznam: {fruits}")
print(f"N-tice: {point}, x = {point[0]}")
print(f"Množina, seřazeně: {sorted(unique_fruits)}")
print(f"Je hruška v množině? {'hruška' in unique_fruits}")
print(f"Cena jablka: {prices['jablko']} Kč")
print(f"Cena kiwi: {prices.get('kiwi', 'neuvedena')}")
```

Výstup:

```text
Seznam: ['jablko', 'hruška', 'jablko', 'banán']
N-tice: (10, 20), x = 10
Množina, seřazeně: ['banán', 'hruška', 'jablko']
Je hruška v množině? True
Cena jablka: 25 Kč
Cena kiwi: neuvedena
```

Množina se před výpisem řadí funkcí `sorted()`, protože její vlastní pořadí se může mezi spuštěními lišit. U řetězců CPython náhodně inicializuje hašovací funkci při každém startu, takže `print(unique_fruits)` může vypsat stejné prvky pokaždé jinak. `sorted()` řadí podle kódů Unicode, ne podle české abecedy: `"čaj"` skončí až za `"dort"`.

**Samostatný příklad** `ntice.py` – mělká neměnnost a hašovatelnost:

```python
record = ("Ada", [90, 85])
record[1].append(100)
print(record)

try:
    record[0] = "Bára"
except TypeError as error:
    print(f"TypeError: {error}")

try:
    index = {record: "hodnocení"}
except TypeError as error:
    print(f"TypeError: {error}")
```

Výstup:

```text
('Ada', [90, 85, 100])
TypeError: 'tuple' object does not support item assignment
TypeError: unhashable type: 'list'
```

Seznam uvnitř n-tice se změnil, ale prvek n-tice nahradit nelze. Protože n-tice obsahuje seznam, nemůže být ani klíčem slovníku.

## 3. Kdy použít :id=_3-when-to-use

- **`list`**, když záleží na pořadí, duplicity jsou v pořádku a obsah se mění.
- **`tuple`** pro pevný záznam, který se nemá měnit, nebo jako složený klíč slovníku, například `(řádek, sloupec)`.
- **`set`** pro odstranění duplicit a rychlý test příslušnosti `in`. Má-li deduplikace zachovat pořadí, použijte `list(dict.fromkeys(items))`.
- **`dict`** pro vyhledání hodnoty podle klíče, například ceny podle názvu zboží.

## 4. Časté chyby :id=_4-common-mistakes

- **Spoléhání na pořadí množiny.** Pro stabilní výstup ji seřaďte (`sorted`) nebo zvolte `list` či `dict`.
- **`{}` jako prázdná množina.** `{}` je prázdný slovník; prázdnou množinu vytvoří `set()`.
- **Neexistující klíč.** `prices["kiwi"]` vyvolá `KeyError: 'kiwi'`. Ověřte klíč přes `in`, použijte `prices.get("kiwi", výchozí)`, nebo výjimku ošetřete.
- **Přiřazení není kopie.** Po `b = a` odkazují obě jména na tentýž seznam a `b.append(3)` změní i `a`. Samostatnou mělkou kopii vytvoří `a.copy()` nebo `list(a)`.
- **Neměnná n-tice s měnitelným obsahem.** Viz příklad `ntice.py`.

<details>
<summary>Volitelné podrobnosti: Pořadí ve slovníku a rovné klíče</summary>

Zachování pořadí vložení ve `dict` garantuje jazyk od Pythonu 3.7. Slovník je však určený především k vyhledávání podle klíče; řazení podle hodnot se dělá samostatně, například `sorted(prices.items(), key=lambda item: item[1])`.

Klíče, které jsou si rovny, jsou pro slovník tentýž klíč. Protože `1 == 1.0 == True`, vytvoří zápis `{1: "a", 1.0: "b", True: "c"}` slovník `{1: 'c'}` – zůstane první vložený klíč a poslední hodnota.

</details>

**Související témata:** [Pythonic code](../B/Pythonic_code.md), [Generátory a iterátory](../B/Generatory_a_iteratory.md).
