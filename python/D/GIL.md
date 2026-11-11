# GIL (Global Interpreter Lock)

GIL je vlastnost konkrétního běhového prostředí, nikoli pravidlo syntaxe jazyka Python. Při volbě vláken je potřeba rozlišit, zda úloha počítá v Pythonu, čeká na vstup a výstup, nebo většinu práce předává nativní knihovně.

## 1. Princip :id=_1-concept

**Global Interpreter Lock** v běžném sestavení CPythonu 3.12 omezuje provádění Python bytecode v jednom interpretu na jedno vlákno v daném okamžiku. Pomáhá chránit interní struktury, ale neznamená „v procesu nikdy neběží nic paralelně“. Při blokujícím I/O se zámek obvykle uvolňuje a některé nativní výpočty jej také pouštějí. Rozhoduje konkrétní rozhraní a implementace; ne každá C funkce GIL uvolní.

**Souběžnost** znamená, že se úlohy během života překrývají; **paralelismus** skutečné současné provádění. Vlákna mohou překrývat čekání, aniž by jejich Python smyčky současně běžely na dvou jádrech. Dvě vlákna proto v obvyklém CPythonu často nezrychlí čistý Python CPU výpočet a mohou přidat režii. [Procesy](Multiprocessing.md) mají oddělené interprety, ale stojí čas na start a přenos dat.

Od CPythonu 3.13 existuje také volitelné **free-threaded sestavení**, které může běžet bez GIL; není totožné s běžnou instalací stejného čísla verze. Rozlišujte schopnost sestavení a aktuální stav: GIL lze zapnout i v takovém procesu a nepřipravené nativní rozšíření jej může při importu znovu povolit. Kompatibilitu knihoven ověřujte zvlášť. Běh bez GIL nezaručuje zrychlení a vyžaduje správnou synchronizaci. **GIL nenahrazuje zámek kolem vícekrokové změny sdíleného stavu.**

## 2. Příklad :id=_2-example

**Samostatný soubor `gil_demo.py`:** Python 3.12 nebo novější, pouze standardní knihovna. Zvolte podporovaný interpret; ukázka nevynucuje ani nemění jeho sestavení. V novém adresáři připravte prostředí.

Windows PowerShell:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe gil_demo.py
.\.venv\Scripts\python.exe gil_demo.py --work -1
```

macOS/Linux:

```bash
python3 -m venv .venv
.venv/bin/python gil_demo.py
.venv/bin/python gil_demo.py --work -1
```

V každém pokusu zpracujeme přesně **dvě stejné úlohy**, postupně a dvěma vlákny. U CPU jde o skutečnou Python smyčku; druhá úloha používá řízené čekání `sleep`, nikoli skutečný disk nebo síť. Ukazuje překrytí čekání, neměří výkon služby. Měříme uplynulý čas i CPU čas celého procesu včetně pracovních vláken.

```python
import argparse
from concurrent.futures import ThreadPoolExecutor
import platform
import statistics
import sys
import sysconfig
import time


def cpu_work(n):
    if n < 0:
        raise ValueError("Počet iterací nesmí být záporný")
    total = 0
    for i in range(n):
        total += i * i
    return total


def wait_work(delay):
    time.sleep(delay)
    return "hotovo"


def measure(function, argument, threaded):
    wall_start, cpu_start = time.perf_counter(), time.process_time()
    if threaded:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(function, [argument, argument]))
    else:
        results = [function(argument), function(argument)]
    return (time.perf_counter() - wall_start,
            time.process_time() - cpu_start, results)


def main():
    parser = argparse.ArgumentParser(description="Dvě stejné úlohy postupně a ve vláknech")
    parser.add_argument("--work", type=int, default=500_000)
    args = parser.parse_args()
    if not 0 <= args.work <= 2_000_000:
        parser.error("--work musí být od 0 do 2000000")
    print("Implementace:", platform.python_implementation())
    print("Sestavení podporuje free threading:",
          sysconfig.get_config_var("Py_GIL_DISABLED") == 1)
    gil_probe = getattr(sys, "_is_gil_enabled", None)
    print("Aktuální GIL:", gil_probe() if gil_probe else "rozhraní není dostupné")
    for name, function, argument in [("Python CPU", cpu_work, args.work),
                                      ("Řízené čekání", wait_work, 0.05)]:
        reference = [function(argument), function(argument)]
        for threaded in (False, True):
            measurements = [measure(function, argument, threaded) for _ in range(3)]
            if any(values != reference for _, _, values in measurements):
                raise RuntimeError("Výsledky variant se liší")
            wall = statistics.median(row[0] for row in measurements)
            cpu = statistics.median(row[1] for row in measurements)
            mode = "2 vlákna" if threaded else "postupně"
            print(f"{name}, {mode}: medián wall={wall:.4f} s, CPU={cpu:.4f} s")
        print(name, "shoda:", reference[0] == reference[1])
    print("Výsledek jedné CPU úlohy:", cpu_work(args.work))


if __name__ == "__main__":
    main()
```

Při výchozí velikosti je výsledek jedné CPU úlohy `41666541666750000`; oba způsoby musí dát stejné hodnoty. Na běžném CPythonu 3.12 první diagnostika ukáže `False` a dotaz na aktuální GIL není dostupný. To neznamená vypnutý GIL: tato starší verze jen nemá uvedenou diagnostickou funkci. U jiných implementací Pythonu je nutná jejich vlastní dokumentace.

Pro dvě čekání po 0,05 s očekávejte postupný čas přibližně 0,10 s a překrytý kolem 0,05 s plus režie, CPU čas zůstává malý. Rozlišení CPU hodin může být pro krátký pokus hrubé: výpis `0.0000` neznamená nulovou práci a drobný rozdíl CPU proti wall není důkazem paralelismu. Přesné časy a poměr CPU variant závisejí na sestavení, stroji a zátěži; tři opakování nejsou obecný benchmark. Vláknová varianta zahrnuje vytvoření a ukončení executorů, neizoluje pouze výpočet v již běžícím poolu. Dlouho žijící pool měřte zvlášť.

`--work -1` skončí kódem 2 před založením vláken. `map` předá výjimku pracovní funkce při čtení výsledku volajícímu; kontext `with` počká na dokončení a uvolní vlákna i při chybě. Neumí násilně přerušit již běžící libovolnou funkci; dlouhá práce potřebuje vlastní spolupracující ukončení a limity.

## 3. Kdy použít :id=_3-when-to-use

Vlákna zvažujte pro blokující knihovny a čekání, procesy pro oddělitelné Python CPU úlohy a [asyncio](Async_programming.md) pro mnoho čekajících operací s asynchronním rozhraním. Asynchronní plánování samo nepřidává jádro pro Python výpočet. Nativní numerika může uvolnit GIL a spouštět vlastní vlákna; kombinace dalších poolů pak může přetížit procesor místo zrychlení.

## 4. Časté chyby :id=_4-common-mistakes

- Tvrzení „všechna Python vlákna jsou sériová“ bez uvedení interpretu, sestavení a druhu práce.
- Spoléhání na GIL při změně „přečti → uprav → zapiš“; používejte explicitní synchronizaci z [multithreadingu](Multithreading.md).
- Odvození stavu GIL jen z čísla verze či nainstalované binárky, bez kontroly běžícího procesu.
- Zaměnění `sleep` za skutečné měření síťového přenosu, databáze nebo disku.

<details>
<summary>Volitelné podrobnosti: hranice interpretu</summary>

Oddělené interprety a jejich rozhraní jsou další možnost závislá na vydání CPythonu; všechny konfigurace nelze zjednodušit na jediný zámek celého procesu. Ani procesová izolace neodstraní náklady serializace či souběžný přístup ke společnému souboru. Nejprve určete, která data se sdílejí a kdo je vlastní.

</details>

Běžný interpret popisuje [FAQ CPythonu](https://docs.python.org/3.12/faq/library.html#can-t-we-get-rid-of-the-global-interpreter-lock), volitelná sestavení a jejich diagnostiku [průvodce free threading](https://docs.python.org/3.14/howto/free-threading-python.html).
