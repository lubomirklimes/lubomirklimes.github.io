# CLI aplikace

CLI (command-line interface) je rozhraní ovládané argumenty příkazové řádky a návratovým kódem procesu. `argparse` poskytuje parser, nápovědu a hlášení chyb argumentů; úspěch samotné operace musí posoudit aplikace.

## Princip :id=_1-concept

Oddělte vytvoření parseru, vlastní operaci a `main()`. Funkce `main(argv)` může při testu dostat seznam argumentů; při `None` parser čte `sys.argv[1:]`. Kontrola `if __name__ == "__main__"` brání spuštění CLI při importu modulu. `raise SystemExit(main())` předá návratový kód shellu.

V tomto nástroji znamená 0 úspěch (také `--help`), 1 chybu souborové operace a 2 neplatné argumenty. Jde o zvolenou dohodu, ne o univerzální význam všech programů. Výsledek pište na stdout, diagnostiku na stderr, aby šlo výsledek dále zpracovat.

## Úplný příklad :id=_2-example

**Soubor `wordcount.py`:** počítá neprázdné části oddělené mezerami, tabulátory nebo konci řádků, nikoli jazykově rozpoznaná slova. Minimální délka je délka podle `len()` a musí být kladná. Otevření souboru proběhne až po zpracování argumentů a `--help`.

```python
import argparse
from pathlib import Path
import sys

def positive_int(raw: str) -> int:
    try:
        value = int(raw)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("Očekáváno celé číslo") from exc
    if value < 1:
        raise argparse.ArgumentTypeError("Hodnota musí být alespoň 1")
    return value

def count_words(path: Path, minimum: int) -> int:
    with path.open("r", encoding="utf-8") as stream:
        return sum(1 for line in stream for word in line.split() if len(word) >= minimum)

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="wordcount", description="Počet slov v textovém souboru", allow_abbrev=False,
    )
    parser.add_argument("file", type=Path, help="Cesta k souboru v UTF-8")
    parser.add_argument("--min-length", type=positive_int, default=1, help="Minimální délka (výchozí: 1)")
    args = parser.parse_args(argv)
    try:
        total = count_words(args.file, args.min_length)
    except (OSError, UnicodeError) as exc:
        print(f"Nelze přečíst vstup ({type(exc).__name__})", file=sys.stderr)
        return 1
    print(f"Počet slov: {total}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
```

### Spuštění z terminálu

Vedle `wordcount.py` vytvořte soubor `slova s mezerou.txt` v UTF-8 s obsahem:

```text
Ahoj světe
a Python
```

Použijte interpret prostředí z [úvodu](../A/Uvod_do_Pythonu.md). Windows PowerShell:

```powershell
.\.venv\Scripts\python.exe wordcount.py "slova s mezerou.txt" --min-length 4
.\.venv\Scripts\python.exe wordcount.py --help
.\.venv\Scripts\python.exe wordcount.py "slova s mezerou.txt" --min-length 0
$LASTEXITCODE
```

macOS/Linux:

```bash
.venv/bin/python wordcount.py "slova s mezerou.txt" --min-length 4
.venv/bin/python wordcount.py --help
.venv/bin/python wordcount.py "slova s mezerou.txt" --min-length 0
echo $?
```

První příkaz vypíše na stdout `Počet slov: 3` a skončí kódem 0. `--help` zobrazí použití, popis a volby, například:

```text
usage: wordcount [-h] [--min-length MIN_LENGTH] file

Počet slov v textovém souboru
```

Nápověda dále obsahuje `-h, --help`, `--min-length MIN_LENGTH` a jejich popisy. Vestavěné popisky se mohou lišit podle verze a lokalizace argparse. Neplatná nula vypíše na stderr:

```text
usage: wordcount [-h] [--min-length MIN_LENGTH] file
wordcount: error: argument --min-length: Hodnota musí být alespoň 1
```

Následující příkaz zobrazí návratový kód `2`. Chybějící soubor vede na stderr k `Nelze přečíst vstup (FileNotFoundError)` a kódu 1. Cesty s mezerami v terminálu uzavřete do uvozovek; do seznamu argumentů pro subprocess je nepřidávejte.

## Kdy rozdělit příkazy a balíček :id=_3-when-to-use

Pro více operací použijte podpříkazy (například `tool add` a `tool list`) přes `add_subparsers()` a sdílenou aplikační logiku držte mimo parser. `type=Path` převádí cestu na objekt; nekontroluje existenci ani přístupnost. Parserové chyby řeší argparse, provozní chyby nástroje patří do `main()` nebo do konkrétní aplikační vrstvy.

Distribuovaný balíček může definovat konzolový vstupní bod: po instalaci vznikne příkaz, který zavolá zadanou funkci. Přesuňte kód z `wordcount.py` do `mytool/cli.py`, přidejte prázdný `mytool/__init__.py` a do kořene projektu následující konfiguraci. **Vícesouborový příklad — vyžaduje instalační nástroj pip:**

```toml
[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[project]
name = "cesky-wordcount-demo"
version = "0.1.0"
requires-python = ">=3.12"

[project.scripts]
wordcount = "mytool.cli:main"

[tool.setuptools.packages.find]
include = ["mytool*"]
```

Uložte jako `pyproject.toml` vedle složky `mytool`. Sekce `build-system` volí nástroj pro sestavení projektu (zde setuptools), `project` jeho metadata a `project.scripts` příkaz a funkci. Z této složky spusťte interpretem prostředí `python -m pip install .`. Poté Windows `.\.venv\Scripts\wordcount.exe --help`, macOS/Linux `.venv/bin/wordcount --help` zobrazí tutéž nápovědu. Instalátor vytvoří spouštěcí soubor v prostředí; název distribuce a importního balíčku se mohou lišit. Viz [Moduly a balíčky](../B/Moduly_a_balicky.md).

## Časté chyby :id=_4-common-mistakes

Neprovádějte operaci při importu, nevypisujte traceback za každou očekávanou chybu uživatelského vstupu a nevracejte 0 po selhání. Široké `except Exception` kolem všeho může skrýt programátorskou chybu. Pokud necháte `ArgumentParser.error()` ukončit proces kódem 2, berte to při testu `main()` jako `SystemExit`, nikoli jako běžnou návratovou hodnotu.

Zápornou nebo nulovou minimální délku odmítněte dřív, než se nástroj pokusí číst soubor. Neodvozujte povolenou velikost vstupu pouze z toho, že je text čten po řádcích: jeden extrémně dlouhý řádek může být velký. Pro skutečně nedůvěryhodný zdroj určete také limity vstupu podle použití.

<details>
<summary>Volitelné podrobnosti: testování rozhraní</summary>

Testujte návratové kódy, oba výstupní proudy, `--help`, chybějící povinný argument, neplatné číslo, chybějící soubor a chybu dekódování. `main([...])` umožňuje rychlé testy parseru; spuštění přes subprocess navíc prověří skutečné chování procesu a podmínku `if __name__ == "__main__"`.

`allow_abbrev=False` brání tomu, aby se zkrácené `--min` tiše považovalo za `--min-length`; přidání další volby pak nezmění význam dříve přijímané zkratky. Pro strojově zpracovatelný výstup definujte samostatný formát, například JSON, a neposílejte do něj běžnou diagnostiku.

</details>

## Související témata

- [Práce s procesy](Prace_s_procesy.md) — bezpečné spuštění a zachycení kódu.
- [Logování](Logging.md) — diagnostika na hranici aplikace.
- [Moduly a balíčky](../B/Moduly_a_balicky.md) — importy a struktura.
