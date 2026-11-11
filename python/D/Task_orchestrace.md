# Task orchestrace

Orchestrace znamená řídit spouštění, výsledky, chyby a ukončení více úloh. Důležité není jen „počkat na všechno“, ale také vědět, kdo vlastní zbývající práci, pokud jedna operace selže. Navazujeme na [korutiny a Task](Async_programming.md).

## 1. Princip :id=_1-concept

**Strukturovaný souběh** váže život potomků k bloku, který je vytvořil. `asyncio.TaskGroup` při běžném opuštění kontextu počká na všechny své Tasks. Při chybě jiné než `CancelledError` zruší ostatní, počká na jejich úklid a běžné chyby seskupí do **ExceptionGroup**. Syntaxe `except* ValueError` zpracuje odpovídající části takové skupiny; ostatní chyby dál propagují. Obě rozhraní jsou dostupná od Pythonu 3.11, zde používáme 3.12+.

Zrušení je požadavek, který se projeví typicky při nejbližším čekání jako `CancelledError`. Nezastaví blokující C funkci ani libovolný nekonečný výpočet. Prostředky uklízejte v `finally` a zrušení bez zvláštního důvodu nepolykejte. `asyncio.timeout()` stanoví rozsah čekání; `TimeoutError` zachycujte vně jeho kontextu.

**Zpětný tlak (backpressure)** zabrání výrobci hromadit práci rychleji, než ji lze spotřebovat. `asyncio.Queue(maxsize=2)` pustí do čekající fronty nejvýše dvě položky, další `await put()` musí počkat. Dva pracovníci zároveň omezují počet právě zpracovávaných položek. Fronta není trvalé úložiště ani potvrzení obchodního účinku; souvislosti rozebírá [messaging](../G/Messaging.md).

## 2. Příklad :id=_2-example

**Samostatný soubor `task_batch.py`:** Python 3.12+, standardní knihovna. Dávka obsahuje nejvýše dvacet malých čísel, dva pracovníci počítají jejich druhé mocniny. Krátké asynchronní čekání představuje operaci, která umí předat řízení, nikoli výpočetní zrychlení. Program ukáže úspěch, chybu pracovníka i timeout.

V novém adresáři připravte prostředí, další balíčky nejsou potřeba.

Windows PowerShell:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe task_batch.py
```

macOS/Linux:

```bash
python3.12 -m venv .venv
.venv/bin/python task_batch.py
```

```python
import asyncio


async def run_batch(values, fail_on=None):
    if (not isinstance(values, list) or len(values) > 20
            or any(type(value) is not int or not 0 <= value <= 100 for value in values)):
        raise ValueError("Dávka vyžaduje nejvýše 20 celých čísel 0 až 100.")
    queue = asyncio.Queue(maxsize=2)
    results = {}
    active = peak = 0

    async def produce():
        for index, value in enumerate(values):
            await queue.put((index, value))
        await queue.join()
        for _ in range(2):
            await queue.put(None)

    async def worker(name):
        nonlocal active, peak
        try:
            while True:
                item = await queue.get()
                try:
                    if item is None:
                        return
                    index, value = item
                    active += 1
                    peak = max(peak, active)
                    try:
                        await asyncio.sleep(0.02)
                        if value == fail_on:
                            raise ValueError(f"Položku {value} nelze zpracovat.")
                        results[index] = value * value
                    finally:
                        active -= 1
                finally:
                    queue.task_done()
        finally:
            print("Ukončen pracovník:", name)

    async with asyncio.TaskGroup() as group:
        group.create_task(produce())
        group.create_task(worker("A"))
        group.create_task(worker("B"))
    return [results[index] for index in range(len(values))], peak


async def main():
    result, peak = await run_batch([1, 2, 3, 4, 5, 6])
    print("Výsledky:", result, "nejvýše současně:", peak)
    try:
        await run_batch([1, 2, 3, 4], fail_on=2)
    except* ValueError as errors:
        print("Dávka selhala:", [str(error) for error in errors.exceptions])
    try:
        async with asyncio.timeout(0.001):
            await run_batch([1, 2, 3, 4])
    except TimeoutError:
        print("Časový limit vypršel; pracovníci jsou ukončeni.")


if __name__ == "__main__":
    asyncio.run(main())
```

Úspěšný výpis obsahuje `Výsledky: [1, 4, 9, 16, 25, 36] nejvýše současně: 2`. Dále uvidíte `Položku 2 nelze zpracovat.` a zprávu o timeoutu. Každý zahájený běh vypíše ukončení pracovníků A i B; jejich pořadí neberte jako smlouvu plánovače. Při selhání nevracíme částečný seznam jako úspěšný výsledek.

`task_done()` odpovídá jednomu vyzvednutí z fronty. Je v `finally`, takže každá vyzvednutá položka dostane právě jedno oznámení i při chybě. `join()` čeká na vyrovnání tohoto čítače, nikoli na konec pracovníků. Při selhání zůstanou některé dosud nevyzvednuté položky nezpracované: opustí se spolu s místní frontou, nepředstíráme dokončení celé dávky. Po úspěšném `join()` producent vloží dvě ukončovací značky `None`. Při chybě pracovníka `TaskGroup` zruší i producenta, který by jinak mohl neomezeně čekat na plnou frontu nebo nedokončený `join()`.

Prázdná dávka vrátí `([], 0)`. Neplatný vstup vyvolá `ValueError` ještě před vytvořením úloh. Časový limit 1 ms je záměrně kratší než první čekání 20 ms: učí chybovou cestu, není měřením odezvy pracovního systému.

## 3. Kdy použít :id=_3-when-to-use

Skupina se hodí pro práci patřící k jednomu požadavku či dávce: chyba jedné části znamená opustit celý celek. Pokud jsou položky nezávislé a smí jednotlivě selhávat, zachyťte konkrétní očekávanou chybu uvnitř pracovníka a vraťte například výsledek s chybovým stavem. Nepřevádějte bez rozlišení každou výjimku na úspěch.

`asyncio.gather()` zachovává pořadí vstupů, ale při výchozím nastavení předá první výjimku volajícímu a ostatní úlohy tím automaticky nezruší. `return_exceptions=True` vrací chyby jako výsledky, které musíte vědomě prohlédnout. Pokud je zrušeno samotné `gather`, ruší také nedokončené děti.

## 4. Časté chyby :id=_4-common-mistakes

- `cancel()` samo na dokončení nepočká. Po zrušení musíte úlohu také převzít pomocí `await`, skupiny nebo odpovídajícího `gather`.
- Semaforem kolem jednoho volání neomezíte množství již vytvořených Tasks ani všech uložených vstupů. Fronta omezuje čekající položky; vstupní zdroj zde navíc omezuje velikost celé dávky.
- Po timeoutu se spustí nový pokus, aniž by byl dokončen úklid předchozího. Opakování může překrýt práci či opakovat účinek.
- `except Exception` nezachytí běžné zrušení `CancelledError`. To je žádoucí; úklid patří do `finally`.

<details>
<summary>Volitelné podrobnosti: první dokončená úloha</summary>

`asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)` vrací dvě množiny, `done` a `pending`. V Pythonu 3.12 mu předávejte Tasks, nikoli samotné korutiny. Dokončená úloha může mít chybu; její `result()` ji znovu vyvolá. `wait` ani jeho timeout zbývající Tasks automaticky nezruší. Při závodu mezi alternativami proto potřebujete `try/finally`, zrušení všech nevybraných úloh a následné čekání na jejich úklid. Výsledek jedné rychlé větve není oprávnění zahodit ostatní bez převzetí.

Od Pythonu 3.13 existují další možnosti ukončení `asyncio.Queue`; příklad záměrně používá ukončovací značky fungující i s naším minimem 3.12. Chování novějšího API ověřte pro zvolenou verzi.

</details>

Přesná pravidla uvádějí [TaskGroup, gather, wait a timeout](https://docs.python.org/3.12/library/asyncio-task.html) a [asyncio fronty](https://docs.python.org/3.12/library/asyncio-queue.html). Práci s objemem dat rozvíjí [I/O optimalizace](IO_optimalizace.md).
