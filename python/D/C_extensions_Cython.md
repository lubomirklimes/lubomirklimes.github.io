# C extensions / Cython

Po [profilování](Profiling.md) někdy zbývá malá výpočetní smyčka, kterou algoritmická změna nevyřeší. Cython dovolí zachovat Python jako řídicí jazyk a tuto část přeložit do nativního rozšíření. Přidává však sestavení, typové a platformní požadavky, které samotná Python funkce nemá.

## 1. Princip :id=_1-concept

Nativní rozšíření je modul se strojovým kódem, na Windows obvykle `.pyd`, na Unixu `.so`. Cython nejprve přeloží zdroj do C a systémový C kompilátor vytvoří rozšíření pro daný Python, operační systém a architekturu. Pouhé vytvoření `.c` souboru není hotový importovatelný modul.

Použijeme **pure Python mode** Cythonu 3: zdroj má příponu `.py` a typové anotace Cythonu. Pro náš běh jej přesto kompilujeme, nespouštíme jako samostatný skript. `double` je C číslo s plovoucí řádovou čárkou, nikoli Python `int` s libovolnou přesností. **Typovaný memoryview** je pohled na číselný buffer; `[::1]` požaduje souvislé uložení jedné osy. `array("d")` ze standardní knihovny poskytne takový buffer bez NumPy.

`const` nedovolí této funkci zapisovat přes pohled, ale nezmrazí podkladová data před jiným vláknem. Během výpočtu je proto nikdo nesmí měnit. Smyčka pracuje pouze s C hodnotami; `with cython.nogil` zde skutečně uvolní GIL. Samotné uvolnění GIL nevytvoří další vlákno a nezaručí rychlejší jednovláknový výpočet. Rychlost plyne hlavně z odstranění interpretovaných operací a použití vhodných typů.

## 2. Příklad :id=_2-example

**Úplný projekt:** Python 3.12+, Cython 3, setuptools, wheel a C kompilátor odpovídající Pythonu. Na Windows použijte 64bitový Python s odpovídajícími Microsoft C++ Build Tools a Windows SDK; na macOS příslušné Command Line Tools, na Linuxu sadu překladacích nástrojů C a vývojové hlavičky Pythonu. Instalace Cythonu sama kompilátor nenainstaluje. Bez sestavení lze použít samostatnou Python variantu, kterou program označí ve výstupu.

V novém krátkém pracovním adresáři vytvořte všechny čtyři soubory:

```text
sum-project/
├── pyproject.toml
├── setup.py
├── app_math.py
└── src/
    └── fast_sum_ext.py
```

Soubor **`pyproject.toml`** deklaruje nástroje sestavení:

```toml
[build-system]
requires = ["setuptools>=64", "wheel", "Cython>=3"]
build-backend = "setuptools.build_meta"
```

Soubor **`setup.py`** pojmenuje rozšíření a jeho zdroj:

```python
from setuptools import Extension, setup
from Cython.Build import cythonize

setup(
    name="sum-demo",
    version="0.1.0",
    packages=[],
    ext_modules=cythonize(
        [Extension("fast_sum_ext", ["src/fast_sum_ext.py"])],
        compiler_directives={"language_level": 3},
    ),
)
```

Soubor **`src/fast_sum_ext.py`** je zdroj určený k překladu. Zákaz kontroly mezí je omezen na smyčku přes přesnou délku bufferu; nepřenášejte ho na libovolné uživatelské indexy.

```python
import cython


@cython.ccall
@cython.boundscheck(False)
@cython.wraparound(False)
def fast_sum(values: cython.const[cython.double][::1]) -> cython.double:
    total: cython.double = 0.0
    i: cython.Py_ssize_t
    with cython.nogil:
        for i in range(values.shape[0]):
            total += values[i]
    return total
```

Soubor **`app_math.py`** obsahuje nezávislou Python variantu, výběr implementace a srovnání stejného součtu. Chybějící modul se odlišuje od jiné chyby importu; poškozená knihovna se nesmí potichu tvářit jako úspěšné nativní sestavení.

```python
import argparse
from array import array
from importlib.machinery import EXTENSION_SUFFIXES
import math
from statistics import median
from timeit import repeat


def python_sum(values):
    total = 0.0
    for value in values:
        total += value
    return total


def validate_values(values):
    if not isinstance(values, array) or values.typecode != "d":
        raise TypeError("Očekávám array('d') s hodnotami double.")
    if not all(math.isfinite(value) for value in values):
        raise ValueError("Hodnoty musejí být konečné.")


def choose_backend(mode):
    if mode == "python":
        return python_sum, "Python smyčka"
    try:
        import fast_sum_ext
    except ModuleNotFoundError as error:
        if error.name != "fast_sum_ext":
            raise
        if mode == "native":
            raise SystemExit("Nativní modul chybí; nejprve jej sestavte.") from error
        return python_sum, "Python smyčka (rozšíření nenalezeno)"
    if not fast_sum_ext.__file__.endswith(tuple(EXTENSION_SUFFIXES)):
        raise ImportError("Nalezený modul není nativní rozšíření.")
    return fast_sum_ext.fast_sum, "Cython"


def main():
    parser = argparse.ArgumentParser(description="Součet stejného číselného bufferu")
    parser.add_argument("--backend", choices=["auto", "python", "native"], default="auto")
    args = parser.parse_args()
    values = array("d", ((i % 17) / 8 for i in range(200_000)))
    validate_values(values)
    selected, name = choose_backend(args.backend)
    print("Vybraná implementace:", name)
    functions = {"Python smyčka": python_sum, "Vestavěný sum": sum}
    if name == "Cython":
        functions["Cython"] = selected
    print("Hodnot:", len(values), "měření: 5 opakování po 5 voláních")
    for label, function in functions.items():
        result = function(values)
        samples = [seconds / 5 * 1000 for seconds in repeat(
            lambda: function(values), repeat=5, number=5
        )]
        print(f"{label}: součet={result:.3f}, "
              f"ms/volání min/medián/max={min(samples):.3f}/{median(samples):.3f}/{max(samples):.3f}")
    try:
        validate_values(array("d", [float("nan")]))
    except ValueError as error:
        print("Chyba vstupu:", error)


if __name__ == "__main__":
    main()
```

Windows PowerShell, z kořene tohoto nového projektu:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install "Cython>=3" "setuptools>=64" wheel
.\.venv\Scripts\python.exe app_math.py --backend python
.\.venv\Scripts\python.exe -m pip install --no-build-isolation .
.\.venv\Scripts\python.exe app_math.py --backend native
```

macOS/Linux:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install 'Cython>=3' 'setuptools>=64' wheel
.venv/bin/python app_math.py --backend python
.venv/bin/python -m pip install --no-build-isolation .
.venv/bin/python app_math.py --backend native
```

`--no-build-isolation` používá právě připravené sestavovací prostředí; v něm proto musejí být deklarované nástroje skutečně nainstalované. Při běžném izolovaném sestavení je pip může připravit podle `pyproject.toml`. Build vytváří pomocné soubory pouze v tomto projektu a instalaci v jeho `.venv`; nedělejte ho nad cizími zdroji.

První běh vypíše `Python smyčka`. Úspěšný druhý běh s `--backend native` musí vypsat `Cython` a navíc jeho čas. Všechny tři varianty mají pro tato data součet **199996.250**. Chybná hodnota vypíše `Chyba vstupu: Hodnoty musejí být konečné.` Časy se budou lišit; před měřením každou funkci jednou voláme, tvorba bufferu, validace, import a kompilace jsou mimo měřené úseky. Náklady běžného volání a přijetí bufferu zůstávají uvnitř. U jiných desetinných hodnot mohou rozdílné algoritmy sčítání dát odlišné poslední bity.

Bez kompilátoru `pip install` skončí vysvětlenou chybou nástroje; přesto lze použít `--backend python` nebo `auto` bez rozšíření. `--backend native` pak naopak skončí zprávou, že modul chybí. Zdroj je v `src`, takže jej běh `app_math.py` omylem neimportuje jako hotovou knihovnu. Při nekompatibilní DLL/architektuře opravte prostředí; široké `except ImportError` by takový problém skrylo.

## 3. Kdy použít :id=_3-when-to-use

Překládejte malé skutečně nákladné jádro po porovnání algoritmu, vestavěných funkcí a případně vektorové knihovny. Rozhraní mezi Pythonem a C má režii, takže mnoho drobných volání může vymazat přínos smyčky. Typovaný buffer omezuje kopie, ale zužuje přijímané vstupy. Měření zahrnující převod milionu Python objektů na buffer odpovídá jiné otázce než zdejší opakované zpracování hotového bufferu.

Přímé C/C++ rozšíření nabízí větší kontrolu, ale přidává práci s Python C API, referencemi a chybami. Cython část této práce generuje. Numba překládá podporovaný kód za běhu (JIT, just-in-time); čas prvního překladu je třeba odlišit od dalších volání. Žádná varianta není automaticky vhodná pro celý projekt.

## 4. Časté chyby :id=_4-common-mistakes

- Python `list[int]` se vydává za tentýž kontrakt jako souvislý buffer `double`. Liší se typy, přesnost i náklady převodu.
- Zrychlení malé smyčky se zobecní na celou aplikaci; profilujte znovu a zohledněte podíl této části.
- `nogil` se zamění za automatický paralelní běh nebo bezpečnost sdílených bufferů.
- Rozšíření pro jinou verzi Pythonu, architekturu či OS se zkopíruje jako univerzální soubor. Distribuce vyžaduje odpovídající wheel nebo nové sestavení.

<details>
<summary>Volitelné podrobnosti: sestavení a úklid</summary>

Sestavení dokumentujte spolu s verzí Pythonu, překladačem a platformou; oficiální průvodci popisují [pure Python mode](https://cython.readthedocs.io/en/stable/src/tutorial/pure.html) a [kompilaci](https://cython.readthedocs.io/en/stable/src/userguide/source_files_and_compilation.html). Kompilace a instalace mají vlastní časové náklady, které naše opakované volání nezahrnuje. Po skončení lze instalaci odstranit vlastním interpretem `python -m pip uninstall sum-demo`; v izolovaném cvičném projektu můžete po zavření procesů odstranit celý jím vytvořený adresář. Nemažte hromadně neznámé build adresáře v jiných projektech.

</details>
