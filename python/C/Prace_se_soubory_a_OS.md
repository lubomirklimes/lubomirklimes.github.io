# Práce se soubory a OS

Moduly `pathlib` a `os` propojují program se souborovým systémem a prostředím operačního systému (OS). Kapitola navazuje na [základní souborové I/O](../B/Prace_se_soubory.md); zde jde především o cesty, průchod adresáři, kopírování, přesun a mazání dat.

## Princip :id=_1-concept

`Path` skládá části cesty operátorem `/`, ale nezaručuje existenci, dostupnost ani důvěryhodnost cíle. Základy relativních cest najdete v [práci se soubory](../B/Prace_se_soubory.md). Pracovní adresář měňte uvážlivě: `os.chdir()` ovlivní celý proces, nikoli jen jednu funkci.

Předběžné `exists()` neochrání následné čtení. Mezi kontrolou a operací může soubor zmizet nebo se změnit; jde o souběh kontroly a použití (TOCTOU). Přímé otevření s konkrétní obsluhou chyby odpovídá přístupu EAFP: operaci provést a očekávané selhání vyřešit. `exists()` má smysl pro informativní zobrazení stavu, ne jako záruka úspěchu.

## Příklady :id=_2-example

**Samostatný příklad:** vlastní dočasný adresář, vnořená struktura a nový soubor bez přepsání existujícího. Ukázka kopíruje soubor, přejmenuje ho, přesune do podsložky a nakonec odstraní vytvořená data. Textové rozhraní používá UTF-8; `read_bytes()` by místo převodu textu vrátilo bajty.

```python
from pathlib import Path
from tempfile import TemporaryDirectory
import shutil

with TemporaryDirectory(prefix="python-os-") as directory:
    root = Path(directory)  # Všechny změny patří jen do tohoto nového adresáře.
    notes = root / "data" / "notes"
    notes.mkdir(parents=True)
    source = notes / "notes.txt"
    source.write_text("Ahoj z pathlib!\n", encoding="utf-8")
    print(source.read_text(encoding="utf-8").strip())
    copied = root / "copy.txt"
    shutil.copy2(source, copied)
    renamed = copied.rename(root / "renamed.txt")
    moved = Path(shutil.move(str(renamed), str(notes / "archive.txt")))
    print("Přímo:", sorted(p.name for p in root.glob("*.txt")))
    print("Včetně podsložek:", sorted(p.relative_to(root).as_posix() for p in root.rglob("*.txt")))
    print("Položky:", sorted(p.name for p in notes.iterdir()))
    moved.unlink()
    shutil.rmtree(root / "data")
    print("Zbývá:", list(root.iterdir()))
```

Výstup:

```text
Ahoj z pathlib!
Přímo: []
Včetně podsložek: ['data/notes/archive.txt', 'data/notes/notes.txt']
Položky: ['archive.txt', 'notes.txt']
Zbývá: []
```

`mkdir(parents=True, exist_ok=True)` nevytvoří adresář, pokud některá část cesty koliduje se souborem, a neobchází oprávnění. `glob()` hledá v dané složce, `rglob()` i v podsložkách. `unlink()` odstraní soubor, `rmtree()` celý strom včetně obsahu; nepoužívejte je na cizí data. `rename()` a `move()` mohou při kolizi přepsat cíl nebo selhat podle systému a cílové cesty. Zde cíle vznikají v novém dočasném adresáři. Ten se po opuštění `with` uklidí i při chybě.

**Samostatný příklad:** proměnná prostředí je řetězec, proto hodnotu ověříme. Konfiguraci čteme bez přepisování `os.environ`; výchozí hodnota se použije pouze při chybějícím klíči.

```python
import os
from collections.abc import Mapping

def read_environment(env: Mapping[str, str]) -> str:
    value = env.get("APP_ENV", "dev")
    if value not in {"dev", "test", "prod"}:
        raise ValueError("APP_ENV musí být dev, test nebo prod")
    return value

print("Výchozí:", read_environment({}))
print("Produkce:", read_environment({"APP_ENV": "prod"}))
try:
    print("Aktuální:", read_environment(os.environ))
except ValueError as error:
    print(error)
```

Výstup (při nenastavené `APP_ENV`; jinak se poslední řádek řídí prostředím):

```text
Výchozí: dev
Produkce: prod
Aktuální: dev
```

## Kdy použít a co může selhat :id=_3-when-to-use

`pathlib` pokrývá běžné cesty, průchod adresářem a metadata; `os` poskytuje například prostředí a nižší systémová rozhraní. Výsledky `iterdir()` nejsou seřazené; pokud je pořadí součástí výstupu, seřaďte je. Operace mohou vyvolat `FileNotFoundError`, `PermissionError` nebo jiný `OSError`. Zachyťte jen chybu, pro kterou máte náhradu nebo srozumitelnou odpověď. Dekódování může zvlášť vyvolat `UnicodeDecodeError`.

Přenositelné skládání cesty neznamená shodné chování systémů. Liší se rozlišování velikosti písmen, platná jména, oprávnění, otevřené soubory i symbolické odkazy. Parametr `mode` při vytváření adresáře ovlivňuje platforma a na unixových systémech (POSIX) také `umask`, maska omezující nová oprávnění. Podrobná přístupová pravidla (ACL) se nastavují podle systému; `mode` je nenahrazuje.

## Časté chyby :id=_4-common-mistakes

`write_text()` přepisuje existující obsah. Pro nový výstup použijte `open("x", ...)`, případně navrhněte výslovnou politiku přepisování. Rekurzivní mazání směrujte jen do stromu, který nástroj skutečně vlastní; zde úklid spravuje `TemporaryDirectory`.

Připojení nedůvěryhodného jména pomocí `/` nestačí k omezení přístupu do vyhrazeného adresáře aplikace. Absolutní pravý operand může původní cestu nahradit, `..` může vystoupit výše a symbolický odkaz může mířit jinam. Validujte povolený tvar vstupu podle pravidel aplikace. `resolve()` samo není bezpečnostní hranice ani uzamčení cíle proti souběžné změně.

<details>
<summary>Volitelné podrobnosti: absolutní cesty a prostředí</summary>

`resolve()` vytvoří absolutní cestu a vyhodnotí symbolické odkazy. S `strict=True` vyžaduje existenci; výchozí ne-striktní varianta může ponechat neexistující závěr. I již vyhodnocený cíl se může později změnit. Pro čtení aktuálních metadat použijte `stat()` a počítejte s jeho selháním.

Změny `os.environ` platí pro proces a následně spuštěné potomky, ne pro nadřazený shell. Pro konkrétní subprocess lze předat vlastní kopii přes `env=`. Hesla a tokeny z prostředí nevypisujte do diagnostiky. Předvídatelný nástroj odděluje vstupy, výstupy a vlastní dočasná data místo odvozování všeho od náhodného pracovního adresáře.

</details>

## Související témata

- [Práce se soubory](../B/Prace_se_soubory.md) — režimy, kódování a vlastnictví proudu.
- [Datum a čas](Datum_a_cas.md) — časové údaje a měření trvání.
- [Práce s procesy](Prace_s_procesy.md) — `cwd` a prostředí potomka.
