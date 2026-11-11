# Výkon v Pythonu

Optimalizace začíná otázkou, co je pro uživatele pomalé: jedna odpověď, celá dávka, nebo spotřeba paměti? **Latence** je doba do výsledku, **propustnost** počet dokončených jednotek práce za čas. Zlepšení jedné vlastnosti může zhoršit druhou. Nejdříve změřte skutečnou úlohu a najděte její úzké místo.

## 1. Princip :id=_1-concept

CPython provádí Python bytecode a spravuje dynamicky typované objekty. Volání funkcí, vytváření objektů a přístup k hodnotám mají režii. Aplikace však může většinu času čekat na **I/O**, tedy vstup a výstup z disku, sítě či databáze. Numerická knihovna zase může převážně provádět nativní strojový kód.

**Uplynulý čas (wall-clock)** zahrnuje celou uplynulou dobu včetně čekání. Rozdíl dvou hodnot `time.perf_counter()` měří trvání, nikoli kalendářní datum; jde o monotónní čítač. `time.process_time()` počítá spotřebovaný CPU čas procesu včetně jeho vláken, bez času pouhého čekání. Nezahrnuje práci všech podřízených procesů a není přímo využitím jednoho jádra. Rozdíly hodin pomáhají odlišit výpočet od čekání, samy však neurčí příčinu.

Rozumné pořadí změn:

- Nejprve ověřte správnost a algoritmus. Hledání každé z `n` hodnot v seznamu délky `m` může stát až `O(n × m)` porovnání. Množina potřebuje další paměť a čas na sestavení, ale členství má obvykle průměrnou konstantní cenu.
- Omezte zbytečné převody, kopie a opakované I/O. Dávkování a cache mohou pomoci; cache potřebuje pravidla platnosti i limit paměti.
- Potom porovnávejte varianty stejné práce. Vestavěná funkce, NumPy či [nativní rozšíření](C_extensions_Cython.md) mohou pomoci podle konkrétní úlohy, nikoli automaticky.

**Mikrobenchmark** zkoumá omezený úsek. `timeit` jej opakuje a umožňuje vyloučit přípravu vstupu; standardně během měření dočasně vypíná cyklický garbage collector. To se může lišit od celé aplikace s jejími alokacemi a sběrem paměti. Výsledky doplňte [profilováním](Profiling.md) a měřením skutečného scénáře.

## 2. Příklad :id=_2-example

**Samostatný soubor `vykon_demo.py`:** Python 3.12 nebo novější, pouze standardní knihovna. V novém adresáři vytvořte prostředí; další balíčky nejsou potřeba.

Windows PowerShell:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe vykon_demo.py
.\.venv\Scripts\python.exe vykon_demo.py --size -1
```

macOS/Linux:

```bash
python3 -m venv .venv
.venv/bin/python vykon_demo.py
.venv/bin/python vykon_demo.py --size -1
```

Obě varianty vytvoří stejný seznam druhých mocnin. Vstup vznikne mimo měření, tvorba výsledného seznamu je součástí obou variant. Nejprve je jednou spustíme a porovnáme výsledky, potom provedeme pět měření po deseti voláních.

```python
import argparse
import statistics
import timeit


def squares_loop(numbers):
    result = []
    for number in numbers:
        result.append(number * number)
    return result


def squares_comprehension(numbers):
    return [number * number for number in numbers]


def main():
    parser = argparse.ArgumentParser(description="Porovná dvě tvorby stejného seznamu")
    parser.add_argument("--size", type=int, default=100_000)
    args = parser.parse_args()
    if not 0 <= args.size <= 200_000:
        parser.error("--size musí být celé číslo od 0 do 200000")
    numbers = list(range(args.size))
    first = squares_loop(numbers)
    second = squares_comprehension(numbers)
    if first != second:
        raise RuntimeError("Varianty vracejí jiné výsledky, jejich časy nelze porovnat")
    print("Shoda výsledků:", first == second, "počet:", len(first))
    print("Součet:", sum(first))
    del first, second
    calls = 10
    for name, function in [("for + append", squares_loop),
                           ("comprehension", squares_comprehension)]:
        timer = timeit.Timer(lambda: function(numbers))
        samples = [seconds / calls * 1000
                   for seconds in timer.repeat(repeat=5, number=calls)]
        print(name, "ms/volání:", ", ".join(f"{value:.3f}" for value in samples))
        print(f"  minimum={min(samples):.3f}, medián={statistics.median(samples):.3f} ms")


if __name__ == "__main__":
    main()
```

První řádky jsou `Shoda výsledků: True počet: 100000` a `Součet: 333328333350000`. Následuje pět časů každé varianty v **milisekundách na jedno volání**, nikoli všech deseti dohromady. Minimum ukazuje nejméně rušený pokus, medián prostřední z pěti hodnot. Ani medián není odhadem všech provozních latencí.

Pořadí a rozdíl rychlostí nejsou garantované. Mění je interpret, procesor, zahřátí, plánovač i jiné procesy. Při významném rozhodnutí zkuste také opačné pořadí variant a změřte celý scénář. Comprehension nemění složitost: obě řešení procházejí `n` prvků a drží `n` výsledků. Pokud potřebujete jen součet, seznam nemusí vůbec vzniknout; to už je jiné řešení s jiným výstupním kontraktem.

`--size -1` vypíše chybu a vrátí kód 2 před výpočtem. Velikost 0 vytvoří prázdný seznam se součtem 0. Program nevytváří soubory ani vlákna; jeho data se uvolní při ukončení. Horní mez chrání malou ukázku před nechtěně velkou alokací.

## 3. Kdy použít :id=_3-when-to-use

Měřte, když znáte vstup, požadovaný výsledek a cenu pomalosti. U služby sledujte rozdělení latencí i propustnost pod zátěží; průměr může skrýt dlouhé čekání části požadavků. U dávky měřte i přípravu, pokud ji musí provádět každý provozní běh.

## 4. Časté chyby :id=_4-common-mistakes

- Generátor proti hotovému seznamu ještě nevykonal stejnou práci.
- Přepis čitelného kódu podle jediného času bez kontrol správnosti a opakování.
- Optimalizace krátké smyčky, zatímco aplikace čeká na opakované dotazy.
- Vynechání ceny cache, převodu dat či startu procesu z konečného hodnocení.

<details>
<summary>Volitelné podrobnosti: paměť versus čas</summary>

Průběžné zpracování po blocích omezuje vrcholovou paměť, ale mění životnost vstupů a práci s chybami. Předpočítaná tabulka naopak může vyměnit paměť za kratší další výpočty. Posuzujte potřeby aplikace, nejen dobu jedné funkce. Praktickou práci s bloky rozebírá [I/O optimalizace](IO_optimalizace.md).

</details>

Rozhraní a interpretaci opakování popisuje [timeit](https://docs.python.org/3.12/library/timeit.html), volbu hodin [modul time](https://docs.python.org/3.12/library/time.html). Pro rozhodování o souběhu navazuje [GIL](GIL.md).
