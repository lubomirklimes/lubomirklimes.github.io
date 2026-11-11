# Multithreading

Vlákna dovolují překrývat čekání více úloh v jednom procesu. Sdílejí paměť, takže snadno předávají data, ale také mohou současně měnit stejný stav. Při práci se soubory či síťovými klienty proto řešíme počet vláken, vlastnictví zdrojů, předání chyby a ukončení.

## 1. Princip :id=_1-concept

**Vlákno (thread)** je samostatný tok provádění uvnitř procesu. Úloha **I/O-bound** tráví významnou část času čekáním na vstup a výstup; **CPU-bound** převážně počítá. V běžném CPythonu s aktivním [GIL](GIL.md) více vláken obvykle nezrychlí čistě pythonovou výpočetní smyčku. Čekání na řadu I/O operací a některé nativní knihovny GIL uvolňují; nelze tvrdit, že vlákna nikdy neběží souběžně na více jádrech.

**Závod o sdílený stav (race condition)** znamená závislost výsledku na neřízeném prokládání přístupů. Aktualizace „přečti, přičti, zapiš“ není bezpečný protokol jen proto, že existuje GIL. `Lock` vymezí kritickou sekci pro jediné vlákno. Použijte `with`, aby se uvolnil také při výjimce. Nedržte dlouhé čtení souboru pod jedním globálním zámkem, pokud chráníte jen krátkou změnu souhrnu.

`ThreadPoolExecutor` spravuje omezený fond vláken. `submit` vrátí **Future**, objekt budoucího výsledku; `result()` vrátí hodnotu nebo znovu vyvolá výjimku pracovníka. Bez převzetí výsledku by chyba mohla zůstat přehlédnutá. `as_completed` umožní převzít dokončené úlohy bez čekání na pořadí vstupu. Kontextový manažer při odchodu počká na dokončení vláken.

`Future.cancel()` zruší pouze dosud nespouštěnou práci. Již běžící vlákno tímto voláním bezpečně nezastavíte. **Kooperativní ukončení** znamená, že pracovník sám kontroluje například `Event`, signál mezi vlákny, a skončí v bezpečném místě. Timeout při `result()` omezuje čekání volajícího, nikoli délku operace. Pro skutečné síťové I/O potřebujete i timeout klienta.

## 2. Příklad :id=_2-example

**Samostatný soubor `threads_demo.py`:** Python 3.12+ a standardní knihovna. V novém adresáři připravte prostředí; pip závislosti nejsou potřeba.

Windows PowerShell:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe threads_demo.py
```

macOS/Linux:

```bash
python3 -m venv .venv
.venv/bin/python threads_demo.py
```

Program vytvoří vlastní dočasné soubory, přečte je po blocích nejvýše dvěma vlákny a bezpečně sečte statistiky. Chybějící soubor ukáže předání výjimky. Druhá část záměrně podrží jednoho pracovníka signálem, aby bylo zrušení čekající úlohy spolehlivé, nezávislé na rychlosti počítače.

```python
from concurrent.futures import CancelledError, ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from tempfile import TemporaryDirectory
import threading


@dataclass
class Statistics:
    files: int = 0
    bytes_read: int = 0
    lock: object = field(default_factory=threading.Lock, repr=False)

    def add(self, count):
        with self.lock:
            self.files += 1
            self.bytes_read += count


def read_file(path, statistics):
    count = 0
    with path.open("rb") as source:
        while block := source.read(16 * 1024):
            count += len(block)
    statistics.add(count)
    return path.name, count


def cancellation_demo():
    started, release = threading.Event(), threading.Event()

    def held_job():
        started.set()
        if not release.wait(timeout=5):
            raise TimeoutError("Pracovník nedostal signál k dokončení.")
        return "Běžící úloha dokončena."

    pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="cancel-demo")
    try:
        running = pool.submit(held_job)
        if not started.wait(timeout=5):
            raise TimeoutError("Pracovník se nespustil.")
        waiting = pool.submit(str.upper, "čekající práce")
        print("Zrušena čekající úloha:", waiting.cancel())
        release.set()
        print(running.result(timeout=5))
        try:
            waiting.result()
        except CancelledError:
            print("Čekající úloha výsledek nemá: byla zrušena.")
    finally:
        release.set()
        pool.shutdown(wait=True, cancel_futures=True)


def main():
    statistics = Statistics()
    with TemporaryDirectory(prefix="threads-demo-") as directory:
        root = Path(directory)
        paths = []
        for i, size in enumerate((65536, 131072, 196608)):
            path = root / f"input-{i}.bin"
            with path.open("xb") as target:
                target.write(b"x" * size)
            paths.append(path)
        with ThreadPoolExecutor(max_workers=2, thread_name_prefix="files-demo") as pool:
            futures = [pool.submit(read_file, path, statistics) for path in paths]
            results = [future.result() for future in as_completed(futures)]
            for name, count in sorted(results):
                print(name, "bajtů:", count)
            missing = pool.submit(read_file, root / "missing.bin", statistics)
            try:
                missing.result()
            except FileNotFoundError:
                print("Vstup chybí: missing.bin")
        print("Souborů:", statistics.files, "bajtů celkem:", statistics.bytes_read)
    print("Soubory zavřeny, dočasný adresář odstraněn.")
    cancellation_demo()


if __name__ == "__main__":
    main()
```

Uvidíte velikosti 65536, 131072 a 196608 bajtů, souhrn `Souborů: 3 bajtů celkem: 393216` a zprávu o chybějícím vstupu. Zrušení čekající úlohy vypíše `True`, běžící úloha přitom normálně skončí. Výsledky souborů před tiskem řadíme; jejich skutečné pořadí dokončení není slíbené. Malé lokální soubory mohou být v systémové cache: ukázka nevydává jejich čtení za důkaz zrychlení disku.

Pracovníci otevírají každý svůj soubor. Sdílený je pouze souhrn a zámek chrání dvě související změny. `as_completed` neomezuje počet naplánovaných úloh: zde jsou jen tři; u velkého zdroje omezte také čekající zadání, například [omezenou frontou](Task_orchestrace.md). Samotné `max_workers=2` neomezuje velikost celé fronty executorů.

## 3. Kdy použít :id=_3-when-to-use

Vlákna pomáhají s několika nezávislými blokujícími klienty či souborovými operacemi. Pro vlastní pracovníky nabízí `queue.Queue` bezpečné předávání položek, `maxsize` zpětný tlak a `Event` signál ukončení. Bezpečnost fronty ale neznamená bezpečnost objektů, které do ní vložíte: po předání se domluvte, kdo je smí měnit.

U dlouhých čistě pythonových výpočtů porovnejte [procesy](Multiprocessing.md) nebo [nativní kód](C_extensions_Cython.md). Volitelné free-threaded sestavení CPythonu má jiné vlastnosti; vyžaduje odpovídající build i bezpečnost sdíleného stavu, nikoli odstranění zámků z programu.

## 4. Časté chyby :id=_4-common-mistakes

- Výjimka pracovníka se považuje za úspěch, protože nikdo nezavolal `Future.result()`.
- Pracovník čeká na další úlohu stejného plně obsazeného fondu: může vzniknout uváznutí, deadlock.
- `cancel()` či timeout se interpretuje jako násilné ukončení již běžícího vlákna.
- Dočasný adresář se odstraní dřív, než fond dokončí čtení. V příkladu je fond uvnitř kontextu adresáře.

<details>
<summary>Volitelné podrobnosti: co zámek skutečně chrání</summary>

Všechny přístupy udržující společný invariant musejí respektovat stejný zámek. Souhrn v příkladu čteme až po ukončení fondu, kdy se už nemění. Při průběžném zobrazování by i čtenář potřeboval konzistentní snímek pod zámkem. Více zámků získávejte ve stanoveném pořadí, jinak mohou vlákna čekat jedno na druhé. Podrobnosti nabízí [oficiální dokumentace executorů](https://docs.python.org/3/library/concurrent.futures.html).

</details>
