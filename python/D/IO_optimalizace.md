# I/O optimalizace

Vstup a výstup (**I/O**, input/output) často znamenají čekání na soubor, síť nebo databázi. Nejdřív zjistěte, zda problémem je doba jedné operace, počet operací, přenosový objem nebo paměť. Rychlejší CPU smyčka nemusí odstranit čekání na vzdálený server.

## 1. Princip :id=_1-concept

**Latence** je doba jedné operace, **propustnost** množství práce za jednotku času, například MiB/s nebo požadavky/s. Větší **dávka (batch)** snižuje počet samostatných volání, ale může prodloužit čekání první položky a potřebuje více paměti. **Buffer** dočasně uchovává přenášená data, takže každé aplikační čtení nemusí znamenat novou operaci zařízení.

**Streaming** zpracovává data po omezených částech místo načtení celého souboru. Může snížit špičku paměti, ale není automaticky rychlejší: častější Python volání mají svou režii. **Cache** ukládá dřívější data pro další použití. Cache operačního systému, která drží soubor v paměti, se liší od aplikační cache odpovědí s pravidly platnosti. Opakované čtení nově zapsaného souboru obvykle neměří studený fyzický disk.

U sítě omezte zbytečné **round-tripy**, celé cesty požadavek–odpověď. **Connection pool** znovu používá omezený počet spojení a šetří jejich navazování; současně musí řešit uzavření, chyby a limity. Souběh může překrývat čekání, ale příliš mnoho spojení zatíží protistranu. Pro asynchronní variantu použijte [omezené pracovníky a frontu](Task_orchestrace.md), pro blokující knihovnu případně [vlákna](Multithreading.md).

## 2. Příklad :id=_2-example

**Samostatný soubor `io_compare.py`:** Python 3.12+, pouze standardní knihovna. Vytvoří vlastní 4 MiB soubor v novém dočasném adresáři. Obě varianty počítají totéž: počet bajtů a SHA-256 celého obsahu. Porovnávat pouhé `read()` s počítáním řádků by zaměňovalo rozdílnou práci za rychlost I/O.

V novém pracovním adresáři uložte soubor a připravte prostředí; nic dalšího se neinstaluje.

Windows PowerShell:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe io_compare.py
```

macOS/Linux:

```bash
python3.12 -m venv .venv
.venv/bin/python io_compare.py
```

Tři opakování následují po zahřívacím čtení. Příprava souboru je mimo měřený úsek, varianty se v opakováních střídají. Samostatný běh `tracemalloc` sleduje špičku alokací Pythonu; nepleťte ji s celkovou pamětí procesu nebo diskovou cache.

```python
import hashlib
from pathlib import Path
from statistics import median
from tempfile import TemporaryDirectory
from time import perf_counter
import tracemalloc

MAX_BYTES = 8 * 1024 * 1024


def digest_all(path, limit=MAX_BYTES):
    if type(limit) is not int or not 0 < limit <= MAX_BYTES:
        raise ValueError("Limit musí být kladné celé číslo nejvýše 8 MiB.")
    with path.open("rb") as source:
        data = source.read(limit + 1)
    if len(data) > limit:
        raise ValueError("Soubor překročil limit.")
    return len(data), hashlib.sha256(data).hexdigest()


def digest_stream(path, chunk_size=64 * 1024, limit=MAX_BYTES):
    if type(chunk_size) is not int or not 0 < chunk_size <= MAX_BYTES:
        raise ValueError("Blok musí mít 1 bajt až 8 MiB.")
    if type(limit) is not int or not 0 < limit <= MAX_BYTES:
        raise ValueError("Limit musí být kladné celé číslo nejvýše 8 MiB.")
    count = 0
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(min(chunk_size, limit - count + 1)):
            count += len(chunk)
            if count > limit:
                raise ValueError("Soubor překročil limit.")
            digest.update(chunk)
    return count, digest.hexdigest()


def peak_python_bytes(function, path):
    tracemalloc.start()
    try:
        function(path)
        return tracemalloc.get_traced_memory()[1]
    finally:
        tracemalloc.stop()


def main():
    with TemporaryDirectory(prefix="io-demo-") as directory:
        path = Path(directory) / "generated.bin"
        block = bytes(range(256)) * 4096
        with path.open("xb") as target:
            for _ in range(4):
                target.write(block)
        methods = {"celý soubor": digest_all, "bloky 64 KiB": digest_stream}
        expected = digest_all(path)
        for function in methods.values():
            function(path)
        timings = {name: [] for name in methods}
        for repeat in range(3):
            order = list(methods) if repeat % 2 == 0 else list(reversed(methods))
            for name in order:
                started = perf_counter()
                result = methods[name](path)
                timings[name].append(perf_counter() - started)
                if result != expected:
                    raise RuntimeError("Varianty nezpracovaly stejný obsah.")
        print("Bajtů:", expected[0], "SHA-256:", expected[1])
        for name, function in methods.items():
            seconds = median(timings[name])
            speed = expected[0] / (1024 ** 2) / seconds
            peak = peak_python_bytes(function, path)
            print(f"{name}: medián={seconds * 1000:.3f} ms, "
                  f"{speed:.1f} MiB/s, špička Python={peak / 1024:.1f} KiB")
        try:
            digest_stream(path, limit=1024)
        except ValueError as error:
            print("Odmítnutí:", error)
    print("Dočasná data jsou odstraněna.")


if __name__ == "__main__":
    main()
```

Výstup obsahuje `Bajtů: 4194304`, shodný obsah pro oba postupy, medián času, propustnost a špičku alokací pro každou metodu a `Odmítnutí: Soubor překročil limit.`. Časy i odhady paměti závisí na systému, Pythonu, diskové cache a další zátěži; nejde o univerzální poměr rychlostí. U streamingové varianty by měla být špička Python alokací výrazně menší, protože současně nedrží celý 4 MiB obsah. Měření zahrnuje i SHA-256 a režii Pythonu, nejen diskové čtení.

`with` uzavře soubory také při chybě; `TemporaryDirectory` odstraní pouze tento nově vytvořený adresář. Ukázka neotevírá ani nepřepisuje vaše existující soubory. Neexistující vstup vyvolá `FileNotFoundError`, nulový blok `ValueError`. Limit obsahu se hlídá během čtení, nikoli jen předběžným `stat()`, protože soubor se může mezi kontrolou a čtením změnit. Hash slouží ke srovnání obsahu, není zde autentizací původu.

## 3. Kdy použít :id=_3-when-to-use

Čtení po blocích se hodí pro větší soubory, kompresi, přenosy či průběžné součty. Pokud navazující algoritmus potřebuje celý obsah, samotná výměna `read()` nestačí: musíte přizpůsobit i jej. Počet současných přenosů a jejich velikosti společně určují paměťový rozpočet.

Pro síťovou službu oddělte dobu navázání spojení, přenos a zpracování. Sledujte nejen průměr, ale i rozdělení latencí, chyby a zátěž; p95 je 95. percentil pozorovaných časů. Cache potřebuje klíč, limit velikosti a pravidlo zneplatnění, jinak může vracet zastaralá či cizí data. U databáze dávkování nesmí potichu změnit transakční požadavky.

## 4. Časté chyby :id=_4-common-mistakes

- Jedno rychlé čtení z teplé cache se označí za rychlost disku. Rozlišujte podmínky a opakování; kvůli ukázce nemažte systémovou cache.
- `read()` bez limitu nad cizím vstupem může vyčerpat paměť. Ani streaming bez celkového limitu nezastaví nekonečný přenos.
- Běžné souborové operace se vloží do `async def` a očekává se automatické předávání řízení. Pro blokující I/O lze použít omezený pool vláken; zrušení čekání neznamená zastavení běžícího čtení.
- Spojení se navazuje pro každou drobnou operaci nebo se otevře neomezeně spojení. Opakované použití i souběh potřebují vlastní limity a úklid.

<details>
<summary>Volitelné podrobnosti: větší blok není vždy nejlepší</summary>

Malé bloky zvyšují počet volání a přenosovou režii; příliš velké zvětšují paměť a mohou prodloužit dobu, než se k výsledku dostane další krok. Zvolených 64 KiB je názorný kompromis, nikoli optimální konstanta pro každý disk či protokol. Experimentujte na reprezentativní velikosti a počtu souborů. Pro lokalizaci nákladů použijte [profilování](Profiling.md); souborové základy navazují na [práci se soubory a OS](../C/Prace_se_soubory_a_OS.md).

</details>

Podrobnosti popisují [bufferované I/O](https://docs.python.org/3.12/library/io.html) a [tracemalloc](https://docs.python.org/3.12/library/tracemalloc.html).
