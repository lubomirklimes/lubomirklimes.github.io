# Generátory a iterátory

Iterace umožňuje zpracovávat hodnoty postupně, bez nutnosti předem sestavit celý výsledek.

## Princip :id=_1-concept

Iterovatelný objekt (iterable) poskytne přes `iter(obj)` iterátor. Seznam lze takto procházet opakovaně s nezávislými iterátory. Iterátor udržuje pozici, `next(it)` vrací další hodnotu a na konci vyvolá `StopIteration`; `iter(it)` vrací tentýž iterátor. Smyčka `for` ukončení obsluhuje sama. Pro ruční čtení lze použít `next(it, default)`; výchozí hodnota by měla být rozlišitelná od platných dat.

Generátorová funkce obsahuje `yield`. Její volání vrátí generátorový iterátor; tělo se začne vykonávat až při prvním vyžádání hodnoty. `yield` pozastaví běh a zachová místní stav. `return` nebo konec těla ukončí iteraci. Generátorový výraz, například `(n * n for n in range(5))`, je jiný zápis pro jednoduchý postupný výpočet.

Odložené vyhodnocování (lazy evaluation) šetří paměť potřebnou pro výsledky, ale nezaručuje malou paměť celého programu. Generátor může držet odkazy na velký vstup nebo sám provádět nákladnou operaci. Funkce níže postupně dělí text, který už je v paměti.

## Příklad :id=_2-example

**Samostatný příklad:** validace `size` proběhne až při prvním `next()`, protože je uvnitř generátorové funkce. Zápornou velikost odmítáme stejně jako nulu.

```python
from collections.abc import Iterator

def split_chunks(text: str, size: int) -> Iterator[str]:
    print("Začíná dělení")
    if size <= 0:
        raise ValueError("Velikost bloku musí být kladná")
    for start in range(0, len(text), size):
        yield text[start:start + size]

chunks = split_chunks("abcdefghijklmnopqrstuvwxyz", 5)
print("Generátor vytvořen")
print(next(chunks))
print(next(chunks))
print(list(chunks))
print(list(chunks))
print(next(chunks, "Konec"))
try:
    next(split_chunks("abc", 0))
except ValueError as error:
    print(error)
```

Výstup:

```text
Generátor vytvořen
Začíná dělení
abcde
fghij
['klmno', 'pqrst', 'uvwxy', 'z']
[]
Konec
Začíná dělení
Velikost bloku musí být kladná
```

Výpis `Generátor vytvořen` předchází `Začíná dělení`: tělo běží až při odběru. Po dvou blocích a seznamu zbytku se vypíše `[]` a `Konec`; opětovné dělení s nulou vypíše chybu. Znovu lze procházet nový objekt z dalšího volání `split_chunks()`, nikoli již vyčerpaný `chunks`.

## Kdy použít :id=_3-when-to-use

Generátor použijte pro řetězení transformací, průchod rozsáhlým vstupem nebo nekonečnou posloupnost s omezeným odběrem. Nástroje `itertools`, například `islice()`, kombinují iterátory bez vytváření všech výsledků. Volání `list()` je naopak vhodné, když potřebujete opakovaný průchod, indexování či uložený snímek konečného výsledku.

U generátoru čtoucího soubor musí soubor zůstat otevřený po dobu odběru hodnot. Vracejte iterátor jen s jasným vlastnictvím zdroje; nejjednodušší je iterovat uvnitř `with` u volajícího, jak ukazuje [práce se soubory](Prace_se_soubory.md). `break` sám obecně nezavírá iterátor ani zdroj, který používá.

## Časté chyby :id=_4-common-mistakes

- Dva konzumenti stejného iterátoru si odebírají položky navzájem. Například `any()` může část vstupu spotřebovat; další průchod nepokračuje od začátku.
- Chyby uvnitř těla se mohou projevit až při odběru. Pouhé vytvoření generátoru neověřuje vstup ani úspěch zpracování.
- Uvnitř generátoru nevyvolávejte `StopIteration` ručně pro ukončení. Použijte `return`; uniklý `StopIteration` se mění na `RuntimeError`.
- Neomezený generátor nelze celý převést na seznam. Omezte počet odebraných položek nebo určete podmínku ukončení.

<details>
<summary>Volitelné podrobnosti: delegování a úklid</summary>

`yield from iterable` postupně předává hodnoty z dalšího iterovatelného objektu. Pro běžnou řadu hodnot často stačí `itertools.chain()`.

Generátor má `close()`, které v místě pozastavení vyvolá `GeneratorExit` a umožní vykonat `finally`. Pokud generátor vlastní prostředek, lze jeho deterministické uzavření vymezit pomocí `contextlib.closing()`. Nespoléhejte na okamžik garbage collection: při předčasném ukončení průchodu nemusí úklid proběhnout hned. Ani `close()` neprovede tělo generátoru, který ještě nezačal běžet.

</details>

## Související témata

- [Typování v Pythonu](Typovani_v_Pythonu.md) — `Iterable` oproti `Iterator`.
- [Práce se soubory](Prace_se_soubory.md) — životnost proudu.
