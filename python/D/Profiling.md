# Profiling

Profilování hledá, kde program tráví čas a vytváří paměťové objekty. Ukáže počet volání i jejich podíl na běhu. Následnou změnu však znovu změřte bez profileru: měřicí nástroj ovlivňuje program a jeho výpis není nezávislý benchmark.

## 1. Princip :id=_1-concept

`cProfile` ze standardní knihovny zaznamenává volání a návraty funkcí, `pstats` je třídí a formátuje. Ve výpisu:

- `ncalls` je počet volání; při rekurzi se může lišit celkový a nerekurzivní počet.
- `tottime` je čas v samotné funkci, bez času funkcí, které zavolala.
- `cumtime` zahrnuje podvolání. Časy rodičů a potomků se překrývají, nesčítejte proto celý sloupec.
- `percall` je příslušný čas dělený počtem volání, ne doba každého jednotlivého požadavku.

Řazení podle `cumulative` hledá drahou větev, podle `tottime` drahý vlastní výpočet. Mnoho levných volání může stát více než jedna nápadná funkce. Profiler také nerovnoměrně zatěžuje Python volání a práci uvnitř nativních funkcí; jeho tabulka není podkladem pro univerzální poměr rychlosti Python versus C.

`tracemalloc` sleduje alokace Pythonu od okamžiku zapnutí. **Aktuální paměť** označuje dosud živé sledované bloky, **špička** nejvyšší současný objem od začátku nebo resetu. Není to celá paměť procesu, součet alokací za běh ani spolehlivé měření všech nativních knihoven. Čas a paměť měřte odděleně, abyste nekombinovali režii obou nástrojů.

## 2. Příklad :id=_2-example

**Samostatný soubor `profiling_demo.py`:** Python 3.12 nebo novější, pouze standardní knihovna. V novém adresáři vytvořte prostředí, nic dalšího neinstalujte.

Windows PowerShell:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe profiling_demo.py
.\.venv\Scripts\python.exe profiling_demo.py --size -1
```

macOS/Linux:

```bash
python3 -m venv .venv
.venv/bin/python profiling_demo.py
.venv/bin/python profiling_demo.py --size -1
```

Vlastní data představují 20 000 událostí se 100 různými ID. První varianta pro každé ID znovu prochází seznam přes `count`; druhá počítá četnosti v jednom průchodu pomocí `Counter`. Obě vracejí stejný slovník. Profil ukáže přesun práce, samostatné paměťové měření cenu výsledku a pomocných struktur.

```python
import argparse
from collections import Counter
import cProfile
import pstats
import tracemalloc


def repeated_scan(values):
    return {value: values.count(value) for value in set(values)}


def one_pass(values):
    return dict(Counter(values))


def profile_call(function, values):
    profiler = cProfile.Profile()
    profiler.enable()
    try:
        result = function(values)
    finally:
        profiler.disable()
    print("\nProfil:", function.__name__)
    pstats.Stats(profiler).strip_dirs().sort_stats("cumulative").print_stats(6)
    return result


def memory_call(function, values):
    tracemalloc.start()
    try:
        result = function(values)
        current, peak = tracemalloc.get_traced_memory()
        print(function.__name__, "živé/špička [KiB]:",
              round(current / 1024, 1), round(peak / 1024, 1))
        return result
    finally:
        tracemalloc.stop()


def main():
    parser = argparse.ArgumentParser(description="Profiluje dvě počítání četností")
    parser.add_argument("--size", type=int, default=20_000)
    args = parser.parse_args()
    if not 0 <= args.size <= 100_000:
        parser.error("--size musí být od 0 do 100000")
    values = [i % 100 for i in range(args.size)]
    first = profile_call(repeated_scan, values)
    second = profile_call(one_pass, values)
    if first != second:
        raise RuntimeError("Varianty nepočítají stejné četnosti")
    print("Shoda:", first == second, "různých ID:", len(first),
          "celkem:", sum(first.values()))
    print("\nSamostatné sledování alokací:")
    for function in (repeated_scan, one_pass):
        memory_call(function, values)
    print("Sledování paměti ukončeno:", not tracemalloc.is_tracing())


if __name__ == "__main__":
    main()
```

V první tabulce hledejte **100 volání `count`**. Při `u` různých hodnotách a `n` řádcích opakované průchody vyžadují zhruba `O(u × n)` práce. `Counter` používá průměrně `O(n)` aktualizací a oba výsledky drží `O(u)` položek. U slovníků jde o průměrné chování hashování, ne nepodmíněnou záruku pro každý vstup.

Po profilech dostanete `Shoda: True různých ID: 100 celkem: 20000`. Paměťový oddíl vypíše KiB každé varianty a poslední řádek `Sledování paměti ukončeno: True`. Vstupní seznam vznikl před `tracemalloc.start()`, jeho předchozí alokace se proto nepočítají. Výsledek je při odečtu stále živý, po návratu jej volající zahodí. Číselné údaje se mění podle interpretu a alokátoru.

`--size -1` skončí kódem 2 před zapnutím měření, velikost 0 vytvoří prázdný slovník. `finally` vypne profiler i sledování alokací také při chybě měřené funkce. Program neukládá profily na disk, nespouští procesy a nepotřebuje síť. Časy variant porovnejte opakovaně bez profileru podle [výkonu v Pythonu](Vykon_v_Pythonu.md).

## 3. Kdy použít :id=_3-when-to-use

Začněte hrubým profilem reprezentativního vstupu. Pro dlouhou drahou funkci může pomoci externí `line_profiler`, který rozepisuje čas po řádcích. V tomto příkladu není potřeba; má vlastní instalaci, podporované verze a režii. U nativních knihoven či souběhu mohou být vhodnější vzorkovací nebo specializované nástroje. Profil hlavního vlákna automaticky nevysvětluje práci všech vláken a procesů.

V provozu sledujte latence, propustnost a paměť pod skutečnou zátěží. Detailní profilování plánujte s ohledem na režii a soukromí dat. Lokální horké místo nemusí být příčinou čekání na vzdálenou službu.

## 4. Časté chyby :id=_4-common-mistakes

- Sečtení kumulativních časů a vydávání součtu za celkovou dobu.
- Porovnání profilovaného starého kódu s neprofilovaným novým.
- Označení `tracemalloc` špičky za celou RAM procesu či velikost jediného objektu.
- Měření jen malého vstupu, který vynechává nákladné běžné cesty aplikace.

<details>
<summary>Volitelné podrobnosti: snímky a ukládání profilů</summary>

`tracemalloc.take_snapshot()` porovnává živé alokace podle řádků mezi dvěma okamžiky. Objekt vytvořený a uvolněný mezi snímky se v rozdílu nemusí objevit; snímek a krátkodobá špička odpovídají jiným otázkám. Profil `cProfile` lze uložit přes `dump_stats` a otevřít v `pstats`. Může obsahovat cesty ke zdrojům: nesdílejte jej bez kontroly a načítejte jen důvěryhodné profily.

</details>

Podrobnosti uvádějí [cProfile a pstats](https://docs.python.org/3.12/library/profile.html) a [tracemalloc](https://docs.python.org/3.12/library/tracemalloc.html). Na novějších vydáních ověřte také nabídku nástrojů dané verze; příklad používá rozhraní dostupné v Pythonu 3.12.
