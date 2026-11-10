# Práce se stringy

**Řetězec** (anglicky string, typ `str`) je v Pythonu text. Tato kapitola ukazuje výběr části textu pomocí indexů a řezů, skládání textu pomocí f-řetězců a důsledky neměnnosti. Ukázky jsou samostatné soubory `.py` a spouštějí se interpretem prostředí z [úvodu](Uvod_do_Pythonu.md).

## 1. Princip :id=_1-concept

`str` je **neměnná** posloupnost znaků Unicode. Metody jako `upper()` nebo `strip()` proto původní řetězec nemění, ale vracejí nový; přiřazení `text[0] = "a"` vyvolá `TypeError: 'str' object does not support item assignment`.

**Index** vybírá jeden znak a počítá se od nuly; záporný index se počítá od konce (`text[-1]` je poslední znak). Index mimo rozsah vyvolá `IndexError`.

**Řez** (slicing) `text[start:stop:step]` vybírá úsek: `start` je zahrnut, `stop` už ne. Vynechaný `start` znamená od začátku, vynechaný `stop` do konce a `step` `-1` prochází text pozpátku. Řez mimo rozsah chybu nevyvolá, jen vrátí kratší nebo prázdný řetězec.

```text
 A   d   a       L   o   v   e   l   a   c   e
 0   1   2   3   4   5   6   7   8   9  10  11
```

**F-řetězec** (`f"..."`) vyhodnotí výrazy ve složených závorkách a vloží jejich textovou podobu. Za dvojtečkou může následovat formát: `{price:.2f}` zaokrouhlí na dvě desetinná místa, `{price:>12,.2f}` navíc zarovná doprava na šířku 12 a oddělí tisíce čárkou.

## 2. Příklad :id=_2-example

**Samostatný příklad** `retezce.py`:

```python
full_name = "Ada Lovelace"
first_name = full_name[:3]
last_name = full_name[4:]
reversed_name = full_name[::-1]

price = 1234.567
message = f"Uživatelka: {first_name} {last_name}, cena: {price:.2f} Kč"

print(first_name)
print(last_name)
print(reversed_name)
print(message)
print(f"|{price:>12,.2f}|")
print(full_name.upper(), full_name)
```

Výstup:

```text
Ada
Lovelace
ecalevoL adA
Uživatelka: Ada Lovelace, cena: 1234.57 Kč
|    1,234.57|
ADA LOVELACE Ada Lovelace
```

`[:3]` vybere znaky s indexy 0–2, `[4:]` vše od indexu 4 a `[::-1]` celý text pozpátku. Poslední řádek ukazuje neměnnost: `upper()` vrátila nový řetězec, `full_name` zůstal beze změny.

Formátování v f-řetězci nezávisí na národním prostředí: oddělovač tisíců je vždy `,` a desetinný oddělovač `.`. České „1 234,57 Kč“ vyžaduje vlastní úpravu nebo lokalizační knihovnu.

## 3. Kdy použít :id=_3-when-to-use

- **Řez** pro data s pevnou pozicí, například kód `"CZ-2024-001"[3:7]`. Pro začátek a konec textu jsou čitelnější `startswith()`, `endswith()` a `removeprefix()` (od Pythonu 3.9); pro text s oddělovačem `split()` nebo `partition()`.
- **F-řetězec** pro zprávy pro uživatele a sestavy. Logovací volání předávají hodnoty jako argumenty (`logger.info("Uživatel %s", name)`), viz [Logování](../C/Logging.md). Do SQL dotazů hodnoty nevkládejte f-řetězcem; použijte parametry databázového rozhraní.
- **`"".join(části)`** pro složení textu z mnoha kusů, například v cyklu.

## 4. Časté chyby :id=_4-common-mistakes

- **Pevné indexy u proměnlivého textu.** `full_name[4:]` funguje jen pro tříznakové jméno. Text s oddělovačem rozdělte: `"Jan Amos Komenský".split(maxsplit=1)` vrátí `['Jan', 'Amos Komenský']`.
- **Volání metody bez uložení výsledku.** `name.strip()` samo o sobě `name` nezmění; zapište `name = name.strip()`.
- **Spojování `+` s jiným typem.** `"Věk: " + 36` vyvolá `TypeError`. F-řetězec `f"Věk: {36}"` hodnotu převede sám.
- **Záměna indexu a řezu.** `text[100]` vyvolá `IndexError`, ale `text[100:]` vrátí prázdný řetězec – chyba se tak může projevit až později.

<details>
<summary>Volitelné podrobnosti: Unicode a obrácení textu</summary>

Řez pracuje s kódovými body Unicode, ne se znaky tak, jak je vidí čtenář. Písmeno `č` může být uloženo jako jeden kódový bod, nebo jako `c` následované kombinujícím háčkem; druhou podobu vytváří například normalizace NFD a lze ji potkat u názvů ze staršího souborového systému HFS+. APFS na macOS zachovává zadanou normalizaci názvu; nejde tedy o obecné pravidlo pro macOS (viz [dokumentace Apple](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/APFS_Guide/FAQ/FAQ.html)). **Samostatný příklad:**

```python
import unicodedata

composed = "čaj"
decomposed = unicodedata.normalize("NFD", composed)

print(len(composed), len(decomposed))
print(composed == decomposed)
print(decomposed[::-1])
print(unicodedata.normalize("NFC", decomposed) == composed)
```

Výstup:

```text
3 4
False
jǎc
True
```

Obě podoby vypadají stejně, ale nejsou si rovny a obrácení přesune háček na jiné písmeno. Text z různých zdrojů před porovnáním normalizujte, například na NFC. Podobně se chovají emoji složená z více kódových bodů.

Od Pythonu 3.12 smí výraz uvnitř f-řetězce používat stejný druh uvozovek jako f-řetězec sám (`f"{prices["jablko"]}"`). Starší verze vyžadují jiné uvozovky: `f"{prices['jablko']}"`.

</details>

**Související témata:** [Základní syntaxe](Zakladni_syntaxe.md), [Logování](../C/Logging.md).
