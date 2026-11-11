# Multiprocessing

Procesy oddělují interpretry i většinu paměti. Mohou proto rozdělit čistě pythonový výpočet mezi více jader i v běžném CPythonu s GIL. Za izolaci platíme startem procesů, přenosem dat a pamětí; krátká práce může skončit rychleji v jediném procesu.

## 1. Princip :id=_1-concept

Proces má vlastní adresní prostor. Běžný seznam předaný dítěti není společný živý seznam rodiče. **IPC** (inter-process communication, komunikace mezi procesy) přenáší zprávy například rourou či frontou. Python objekty se obvykle serializují pomocí **pickle**: převedou se na reprezentaci, kterou druhý interpret obnoví. Velké objekty mohou vytvářet nákladné kopie. Pickle z nedůvěryhodného zdroje může spustit kód; zde komunikují pouze naše vlastní procesy.

`ProcessPoolExecutor` spravuje omezený fond. `map` vrací výsledky v pořadí vstupu, i když se práce dokončuje jinak. `submit` poskytne `Future`; její `result()` vrací hodnotu nebo předá výjimku dítěte. Funkce i argumenty musejí být serializovatelné a pracovní funkce dostupná importem modulu. Lokální funkce či lambda nejsou přenositelnou náhradou pojmenované funkce na úrovni souboru.

**Startovací metoda** určuje vznik dítěte:

- `spawn` spustí čerstvý interpret a importuje hlavní modul. Je výchozí na Windows a macOS; v příkladu ji zvolíme výslovně všude.
- `fork` kopíruje stav rodiče a existuje na POSIX. Kopírování vícevláknového procesu přináší rizika zámků a systémových knihoven.
- `forkserver` vytváří děti přes pomocný server na podporovaných POSIX systémech. Od Pythonu 3.14 je výchozí na podporovaných POSIX platformách; nespoléhejte tedy na staré tvrzení „Linux vždy používá fork“.

Ochrana `if __name__ == "__main__":` zabrání tomu, aby import při `spawn` znovu zakládal fond. Používejte soubor `.py`, nikoli pouze buňku notebooku. `freeze_support()` podporuje spuštění dítěte u zabalených spustitelných aplikací; při běžném spuštění `.py` nemá účinek. `get_context("spawn")` nastaví kontext konkrétního fondu, nemění globální politiku aplikace. [Práce s procesy](../C/Prace_s_procesy.md) popisuje jinou úroveň: spouštění externích programů přes `subprocess`.

## 2. Příklad :id=_2-example

**Samostatný soubor `processes_demo.py`:** Python 3.12+ a standardní knihovna. V novém adresáři vytvořte prostředí; pip závislosti nejsou potřeba.

Windows PowerShell:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe processes_demo.py
```

macOS/Linux:

```bash
python3 -m venv .venv
.venv/bin/python processes_demo.py
```

Spočítáme součty čtverců pro čtyři nezávislé vstupy. Fond má nejvýše dva pracovníky. Záporný vstup zvlášť ukáže, že výjimka dítěte dorazí rodiči; nedostaneme pouze chybějící výsledek.

```python
from concurrent.futures import ProcessPoolExecutor
import multiprocessing as mp
import os
from time import perf_counter


def square_sum(n):
    if type(n) is not int or not 0 <= n <= 1_000_000:
        raise ValueError("n musí být celé číslo od 0 do 1000000.")
    total = 0
    for i in range(n):
        total += i * i
    return n, total, os.getpid()


def main():
    values = [200_000, 300_000, 400_000, 500_000]
    context = mp.get_context("spawn")
    print("Startovací metoda:", context.get_start_method())
    started = perf_counter()
    with ProcessPoolExecutor(max_workers=2, mp_context=context) as pool:
        results = list(pool.map(square_sum, values, chunksize=1))
        invalid = pool.submit(square_sum, -1)
        try:
            invalid.result()
        except ValueError as error:
            print("Chyba z dítěte:", error)
    elapsed = perf_counter() - started
    for n, total, pid in results:
        expected = n * (n - 1) * (2 * n - 1) // 6
        print(f"n={n}, součet={total}, proces={pid}, shoda se vzorcem={total == expected}")
    print("Použitých pracovních procesů:", len({pid for _, _, pid in results}))
    print(f"Celý běh fondu včetně startu a ukončení [s]: {elapsed:.3f}")
    print("Fond ukončen; rodič pokračuje.")


if __name__ == "__main__":
    mp.freeze_support()
    main()
```

Výpis uvede `spawn`, chybovou zprávu záporného vstupu a pro všechna čtyři `n` shodu se vzorcem `True`. Pro `n=200000` je součet **2666646666700000**. PID je identifikátor procesu a mění se při každém spuštění. Dva pracovníci znamenají horní limit, nikoli slib, že každý dostane úlohu; rozdělení závisí na plánování a délce práce.

Čas zahrnuje vytvoření fondu, start interpretů, serializaci, výpočet, chybový pokus i čekání na ukončení. Není to měření samotné smyčky ani důkaz zrychlení. Pro srovnání proveďte tutéž práci sekvenčně a opakujte měření, jak vysvětluje [výkon v Pythonu](Vykon_v_Pythonu.md). U dlouho žijícího fondu měřte zvlášť první start a následné dávky; nepomíchejte tyto situace v jedné tabulce.

## 3. Kdy použít :id=_3-when-to-use

Procesy pomáhají, když výpočty mají dost práce na jednu předanou dávku a lze je rozdělit bez častého sdílení stavu. Posílejte malé popisy úloh a zpracovávejte větší bloky lokálně v dítěti. `chunksize` může omezit režii přenosu mnoha drobných vstupů, ale ovlivňuje rozložení práce i dobu čekání na výsledky.

`max_workers` omezuje běžící pracovníky, nikoli nutně všechna čekající data. V Pythonu 3.12 `map` může dopředu spotřebovat velký vstup; zde je seznam úmyslně malý. Pro velký zdroj použijte omezený počet rozpracovaných `Future`. Novější `buffersize` u executorového `map` vyžaduje Python 3.14+ a není součástí ukázky.

## 4. Časté chyby :id=_4-common-mistakes

- Fond vzniká při importu, takže dítě opět vytváří děti.
- Očekává se společný seznam nebo počitadlo jen proto, že se předaly jako argument. Sdílená paměť, `Value`, zámky nebo manager vyžadují samostatný návrh a vlastní režii.
- V jednom procesu vzniká mnoho fondů nebo každé dítě zakládá další nativní výpočetní vlákna. Počet jader neznamená, že libovolné násobení pracovníků pomůže.
- `Future.result(timeout=...)` se zamění za ukončení výpočtu. Timeout pouze přestane čekat; běžící úloha pokračuje a kontext fondu na ni při odchodu čeká.

<details>
<summary>Volitelné podrobnosti: rušení a životnost</summary>

`Future.cancel()` a `shutdown(cancel_futures=True)` ruší práci, kterou executor ještě nezačal provádět; již odeslaná či běžící práce nemusí jít zrušit. Dlouhý výpočet navrhněte po omezených dávkách nebo s kooperativním signálem vytvořeným ve správném multiprocessing kontextu. Násilné ukončení vlastního procesu je krajní možnost: může zanechat poškozené fronty, zamčené prostředky či neúplné soubory. API pro ukončení celého executorového fondu přidaná v novějších Pythonech nepředpokládejte v 3.12. Ukázka má konečnou malou práci a kontextový manažer děti ukončí před pokračováním rodiče. Oficiální dokumentace popisuje [startovací metody](https://docs.python.org/3/library/multiprocessing.html#contexts-and-start-methods) a [ProcessPoolExecutor](https://docs.python.org/3/library/concurrent.futures.html#processpoolexecutor).

</details>
