# Práce se soubory

Práce se souborem zahrnuje cestu, režim otevření, převod textu a životnost otevřeného proudu.

## Princip :id=_1-concept

`Path("notes.txt")` označuje relativní cestu vůči aktuálnímu pracovnímu adresáři procesu (`Path.cwd()`), nikoli automaticky adresáři skriptu. Pro data vedle skutečného `.py` souboru lze vyjít z `Path(__file__).resolve().parent`; v interaktivní konzoli či notebooku `__file__` nemusí existovat. Samotný `Path` soubor neotevírá ani nevytváří.

Textový proud čte a zapisuje `str`, binární proud `bytes`. U textu explicitně určete kódování odpovídající formátu, například `encoding="utf-8"`. Když nevíte, v jakém kódování soubor je, `encoding="utf-8"` problém nevyřeší: neplatné bajty vyvolají `UnicodeDecodeError`. V binárním režimu se `encoding` nezadává.

Režim `r` čte existující soubor, `w` existující obsah při otevření zkrátí na nulu, `a` přidává na konec a případně soubor vytvoří. Režim `x` vytvoří nový soubor a při kolizi vyvolá `FileExistsError`. Přidání `b`, například `rb`, vybírá binární režim. Rodičovské adresáře se otevřením nevytvoří.

## Příklady :id=_2-example

**Samostatný příklad:** `TemporaryDirectory` vyhradí nový adresář a po skončení jej uklidí. `x` brání náhodnému přepsání stejného jména; příklad ukáže i kolizi a počet bajtů souboru.

```python
from pathlib import Path
from tempfile import TemporaryDirectory

with TemporaryDirectory(prefix="python-notes-") as directory:
    path = Path(directory) / "notes.txt"
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write("První řádek\nDruhý řádek\n")

    with path.open("r", encoding="utf-8") as stream:
        content = stream.read()

    print(content, end="")

    try:
        with path.open("x", encoding="utf-8") as stream:
            stream.write("Nový obsah")
    except FileExistsError:
        print("Soubor už existuje")

    with path.open("rb") as stream:
        print("Počet bajtů:", len(stream.read()))
```

Výstup:

```text
První řádek
Druhý řádek
Soubor už existuje
Počet bajtů: 30
```

Výchozí textové čtení normalizuje běžné konce řádků na `\n`; při zápisu `newline="\n"` vypne platformní převod na CRLF. Potřebujete-li přesné původní bajty, použijte binární režim. Pro malé soubory lze použít také `Path.read_text(encoding="utf-8")` a `write_text(...)`; druhá metoda existující obsah přepíše. Na velký soubor je vhodnější průchod řádky uvnitř `with` než `read()` celého obsahu.

**Samostatný příklad:** funkce přebírá otevřený textový proud, proto jej nezavírá. Otevření a uzavření vlastní volající; stejné chování ukazuje i proud v paměti.

```python
from io import StringIO
from typing import TextIO

def count_nonempty(stream: TextIO) -> int:
    return sum(1 for line in stream if line.strip())

with StringIO("první\n\n druhý \n") as stream:
    print("Neprázdné řádky:", count_nonempty(stream))
    print("Druhý průchod:", count_nonempty(stream))
print("Uzavřeno:", stream.closed)
```

Výstup:

```text
Neprázdné řádky: 2
Druhý průchod: 0
Uzavřeno: True
```

## Chybové cesty a použití :id=_3-when-to-use

Soubor rovnou otevřete a řešte konkrétní selhání (EAFP: nejprve provést operaci, při chybě reagovat). Test `exists()` před `open()` nezaručí úspěch: mezi operacemi se soubor nebo oprávnění mohou změnit. Rozlišujte `FileNotFoundError`, `PermissionError` a další `OSError`. Chyby dekódování, například `UnicodeDecodeError`, nejsou `OSError`.

**Samostatný příklad:** chybějící cesta a neplatné UTF-8 mají odlišné příčiny. Po chybě dekódování se soubor přesto uzavře.

```python
from pathlib import Path
from tempfile import TemporaryDirectory

with TemporaryDirectory(prefix="python-read-") as directory:
    root = Path(directory)
    try:
        (root / "missing.txt").read_text(encoding="utf-8")
    except FileNotFoundError:
        print("Soubor chybí")

    path = root / "invalid.txt"
    with path.open("xb") as stream:
        stream.write(b"\xff")
    try:
        with path.open("r", encoding="utf-8") as stream:
            stream.read()
    except UnicodeDecodeError:
        print("Neplatné UTF-8; uzavřeno:", stream.closed)
```

Výstup:

```text
Soubor chybí
Neplatné UTF-8; uzavřeno: True
```

## Časté chyby :id=_4-common-mistakes

`with` zavře úspěšně otevřený soubor i při výjimce v těle, ale nevrátí zpět již zapsaná data. Nejde o transakci ani záruku uložení na fyzický disk. Nepoužívejte `w` na uživatelský soubor, pokud není přepsání výslovným cílem.

`errors="ignore"` nebo `errors="replace"` může skrýt poškození vstupu a změnit data. Použijte je jen při známém požadavku na ztrátové zpracování. Nepředávejte uzavřený soubor ani generátor nad ním ven z jeho `with`; odběr hodnot vyžaduje dosud otevřený proud.

<details>
<summary>Volitelné podrobnosti: vlastnictví a uzavření</summary>

Funkce, která přijímá cestu a sama soubor otevírá, jej obvykle také zavírá. Funkce přijímající již otevřený proud jej obvykle ponechá volajícímu; toto chování má být popsané v rozhraní funkce. To umožní předat soubor, `StringIO` nebo standardní vstup bez neočekávaného uzavření sdíleného prostředku.

`flush()` předá Pythonem bufferovaná data podkladovému proudu; samotné uzavření není obecná záruka odolnosti proti výpadku napájení. Návrh atomické náhrady a trvalého zápisu závisí na systému a přesahuje tento základ. `with` je obecný protokol správy prostředků: jiné context managery mohou při výjimce například vracet transakci zpět nebo výjimku potlačit; souborový manager ji běžně nepohlcuje.

</details>

## Související témata

- [Generátory a iterátory](Generatory_a_iteratory.md) — odložený odběr a jednorázovost.
- [Výjimky a jejich zpracování](Vyjimky_a_error_handling.md) — konkrétní obsluha a příčina.
- [Práce se soubory a OS](../C/Prace_se_soubory_a_OS.md) — navazující operace s cestami.
