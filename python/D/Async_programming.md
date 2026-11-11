# Async programming

Asynchronní programování umožňuje překrývat čekání několika operací. Hodí se například pro síťového klienta, který nemusí nečinně stát, zatímco protistrana připravuje odpověď. Jeden proces s `asyncio` může obsluhovat více spojení, ale samotné `async` nezrychlí výpočetní smyčku.

## 1. Princip :id=_1-concept

**Korutinová funkce** vzniká pomocí `async def`. Její zavolání vrátí **korutinu**, objekt popisující dosud nedokončený výpočet; běžně ji ještě nespustí. `await` počká na výsledek objektu, který čekání podporuje. Pokud operace skutečně potřebuje čekat, **událostní smyčka (event loop)** může pokračovat jinou připravenou úlohou. Jde o kooperativní plánování: běžící kód musí řízení sám předat.

**Task** naplánuje korutinu a uchovává její výsledek, výjimku i stav zrušení. `asyncio.create_task()` jej vytvoří; `TaskGroup` navíc ohraničí skupinu úloh a při opuštění kontextu na ně počká. **Future** je nižší rozhraní pro budoucí výsledek, často propojené s callbacky knihovny. Aplikační kód obvykle pracuje s korutinami a Tasks místo ručního sestavování Future. Zde jde o `asyncio.Future` svázanou s událostní smyčkou; `concurrent.futures.Future` z kapitol o vláknech a procesech má jiné rozhraní a nelze ji přímo zaměnit ani na ni použít `await`.

`asyncio.run(main())` založí smyčku, provede hlavní korutinu a při ukončení uklidí její běhové prostředí. V běžném skriptu jde o vstupní bod. V notebooku s již běžící smyčkou se používá přímo `await main()`; další `asyncio.run()` do téže běžící smyčky nevkládejte.

Asynchronní síťové operace smyčku při čekání uvolňují. Obyčejné `open(...).read()`, `time.sleep()` a dlouhý Python výpočet ji naopak blokují. Blokující I/O lze přesunout pomocí `asyncio.to_thread()` do vlákna; pro náročný čistě Python výpočet zvažte [procesy](Multiprocessing.md). Ani zrušení čekání na vlákno samo nezastaví jeho již běžící funkci. Rozlišení souběhu a paralelismu vysvětluje [GIL](GIL.md).

## 2. Příklad :id=_2-example

**Samostatný soubor `async_client.py`:** Python 3.12 nebo novější, pouze standardní knihovna. Celý server i klient běží na vlastním počítači. Nejde o HTTP, nýbrž o malý TCP protokol: jeden řádek UTF-8 dovnitř, jeden řádek velkými písmeny ven. Základy požadavků najdete v [HTTP a síťové komunikaci](../C/Networking.md).

V novém pracovním adresáři připravte prostředí a uložte soubor. Žádné další balíčky se neinstalují.

Windows PowerShell:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe async_client.py
```

macOS/Linux:

```bash
python3.12 -m venv .venv
.venv/bin/python async_client.py
```

Server poslouchá pouze na `127.0.0.1`; port 0 požádá systém o volný port. Krátké `sleep` představuje dobu přípravy odpovědi. Klienti přitom skutečně zapisují a čtou socket; časování není měřením vzdálené sítě.

```python
import asyncio
from contextlib import asynccontextmanager


async def close_writer(writer):
    writer.close()
    try:
        await writer.wait_closed()
    except ConnectionError:
        print("Protistrana už spojení ukončila.")


async def handle(reader, writer):
    try:
        async with asyncio.timeout(0.5):
            raw = await reader.readline()
            if not raw.endswith(b"\n") or not 1 < len(raw) <= 64:
                raise ValueError("Očekávám krátký neprázdný řádek.")
            text = raw[:-1].decode("utf-8")
            await asyncio.sleep(0.03)
            writer.write((text.upper() + "\n").encode("utf-8"))
            await writer.drain()
    except (ValueError, UnicodeError, TimeoutError):
        try:
            writer.write(b"ERR: neplatny nebo opozdeny pozadavek\n")
            await writer.drain()
        except ConnectionError:
            print("Chybovou odpověď již nebylo komu předat.")
    except ConnectionError:
        print("Klient se odpojil během přenosu.")
    finally:
        await close_writer(writer)


@asynccontextmanager
async def local_server():
    handlers = set()
    writers = set()

    def connected(reader, writer):
        # Uchováme i dokončené úlohy, abychom převzali jejich výjimky.
        writers.add(writer)
        handlers.add(asyncio.create_task(handle(reader, writer)))

    server = await asyncio.start_server(connected, "127.0.0.1", 0, limit=64)
    try:
        yield server.sockets[0].getsockname()[1]
    finally:
        server.close()
        await server.wait_closed()
        for writer in writers:
            writer.close()
        for task in handlers:
            if not task.done():
                task.cancel()
        outcomes = await asyncio.gather(*handlers, return_exceptions=True)
        for writer in writers:
            await close_writer(writer)
        errors = [value for value in outcomes if isinstance(value, Exception)]
        if errors:
            raise RuntimeError("Obsluha místního serveru selhala.") from errors[0]


async def request(port, payload, timeout=1.0):
    if not isinstance(payload, bytes) or len(payload) > 32 or b"\n" in payload:
        raise ValueError("Klient přijímá nejvýše 32 bajtů bez nového řádku.")
    writer = None
    try:
        async with asyncio.timeout(timeout):
            reader, writer = await asyncio.open_connection("127.0.0.1", port, limit=128)
            writer.write(payload + b"\n")
            await writer.drain()
            response = await reader.readline()
            if not response.endswith(b"\n"):
                raise ValueError("Server nevrátil úplný řádek.")
            return response.decode("utf-8").rstrip("\n")
    finally:
        if writer is not None:
            await close_writer(writer)


async def main():
    async with local_server() as port:
        async with asyncio.TaskGroup() as group:
            jobs = [group.create_task(request(port, text.encode("utf-8")))
                    for text in ["ahoj", "svět", "python"]]
        print("Odpovědi:", [job.result() for job in jobs])
        print("Chybný požadavek:", await request(port, b"\xff"))
    print("Server a jeho spojení jsou uzavřena.")


if __name__ == "__main__":
    asyncio.run(main())
```

Hlavní výstup je `Odpovědi: ['AHOJ', 'SVĚT', 'PYTHON']`. Následuje chybová odpověď `ERR: neplatny nebo opozdeny pozadavek` pro neplatné UTF-8 a potvrzení ukončení serveru. Pořadí seznamu plyne z pořadí uložených `jobs`, ne z pořadí dokončení síťových operací.

`writer.write()` předává bajty transportu; `await writer.drain()` čeká, když výstupní buffer potřebuje uvolnit místo. Není to potvrzení, že příjemce obchodní operaci provedl. `readline()` potřebuje dohodnutý oddělovač; limit délky a časový limit brání neomezenému čekání na nekonečný řádek. Timeout vyvolá `TimeoutError`, uzavření socketu zajistí `finally`.

Kontext serveru vlastní jeho obslužné Tasks a při ukončení je převezme. Samotné zavření naslouchajícího socketu již přijatá spojení automaticky neukončí. Tento malý server uchovává obsluhy po dobu několika pevných požadavků; dlouho běžící služba potřebuje také omezení přijímaných spojení a průběžné přebírání dokončených úloh.

## 3. Kdy použít :id=_3-when-to-use

Async se hodí pro mnoho čekajících síťových operací, pokud jejich knihovna nabízí asynchronní rozhraní. Latence jedné protistrany se tím nutně nezkrátí; zlepšit se může počet současně obsloužených čekání. Pro běžné blokující knihovny mohou být jednodušší [vlákna](Multithreading.md). Životní cyklus více úloh rozvíjí [Task orchestrace](Task_orchestrace.md).

## 4. Časté chyby :id=_4-common-mistakes

- Zavolání korutiny bez `await` nebo naplánování práci neprovede a může vypsat `RuntimeWarning`.
- `await` není bezpodmínečné přepnutí úlohy: hotový výsledek může být vrácen rovnou. CPU smyčku na pozadí neodsune.
- Vytvořit milion Tasks a vložit dovnitř semafor omezí aktivní I/O, ale stále vytvoří milion objektů. Použijte omezený počet pracovníků a frontu.
- `CancelledError` běžně propusťte po úklidu dál. Je potomkem `BaseException`; potlačení může rozbít časové limity a strukturované rušení.

<details>
<summary>Volitelné podrobnosti: časový limit a vzdálená operace</summary>

Timeout omezuje místní čekání. Nezaručuje, že vzdálený server práci zastavil nebo že zprávu nepřijal. Opakování může mít další účinek; pravidla idempotence vysvětlují [distribuované systémy](../G/Distribuovane_systemy.md). `asyncio.timeout()` ruší aktuální úlohu a mění odpovídající zrušení na `TimeoutError` až vně kontextu. Úklid může trvat déle než nastavený limit; nejde o tvrdou dobu ukončení procesu.

</details>

Rozhraní popisuje [dokumentace korutin a Tasks](https://docs.python.org/3.12/library/asyncio-task.html) a [síťových streamů](https://docs.python.org/3.12/library/asyncio-stream.html).
