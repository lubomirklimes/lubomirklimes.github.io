# WebSockets

WebSocket udržuje obousměrné spojení: klient i server mohou posílat zprávy bez nového HTTP požadavku pro každou z nich. Hodí se pro průběžné události, například chat nebo změny na dashboardu. Pro občasné načtení dat bývá jednodušší [HTTP API](REST_API.md).

## 1. Princip :id=_1-concept

Běžné HTTP má tok požadavek → odpověď. WebSocket začne vyjednáním spojení (**handshake**): v obvyklém HTTP/1.1 scénáři klient požádá o `Upgrade: websocket` a server přijetí potvrdí stavem 101. Poté po stejném spojení proudí textové nebo binární zprávy v obou směrech. Zprávy už nemají HTTP status 200 či 404; vlastní protokol musí definovat úspěch a chybu. Při uzavření se posílá ukončovací kód, například 1000 pro běžný konec.

Každé spojení zabírá prostředky. Server musí omezit velikost zpráv, čekání, fronty a podle provozu také počet klientů a rychlost zpráv. Ping/pong pomáhá odhalit ztracené spojení, ale nepotvrzuje zpracování obchodní operace. Ani doručení zprávy do socketu nezaručuje trvalé uložení.

**Origin** označuje původ webové stránky (`schéma://hostitel:port`). Prohlížeč jej posílá při handshake; server má povolit jen očekávané originy, zvlášť při autentizaci cookie. WebSocket nepoužívá CORS preflight, tedy předběžný HTTP dotaz prohlížeče na povolení požadavku, který může předcházet volání `fetch`. Kontrola originu neověřuje uživatele: vlastní Python klient může hlavičku nastavit sám.

## 2. Příklad :id=_2-example

**Úplný dvousouborový příklad:** Python 3.12 nebo novější a knihovna `websockets` s moderním rozhraním `websockets.asyncio` (verze 14.1 nebo novější). Server pouze vrací klientův text; je záměrně anonymní, nemá soukromá data ani právo provádět změny jménem uživatele.

V novém adresáři vytvořte `ws_server.py` a `ws_client.py`. Ověřte, že vybraný `py -3` nebo `python3` spouští Python alespoň 3.12. Windows PowerShell:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install "websockets>=14.1"
```

macOS/Linux:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install 'websockets>=14.1'
```

`ws_server.py`:

```python
import asyncio
import json

from websockets.asyncio.server import serve
from websockets.exceptions import ConnectionClosed


async def echo(connection):
    print("Připojeno")
    try:
        async for raw in connection:
            if not isinstance(raw, str):
                await connection.close(code=1003, reason="Použijte textový JSON")
                return
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await connection.send(json.dumps({"error": "Neplatný JSON"}))
                continue
            if not isinstance(message, dict):
                await connection.send(json.dumps({"error": "Očekáván objekt"}))
                continue
            if message.get("type") == "close":
                await connection.send(json.dumps({"message": "Na shledanou"}))
                await connection.close(code=1000, reason="Hotovo")
                return
            text = message.get("text")
            if message.get("type") != "echo" or not isinstance(text, str) or not 1 <= len(text) <= 100:
                await connection.send(json.dumps({"error": "echo vyžaduje text o 1 až 100 znacích"}))
                continue
            await connection.send(json.dumps({"echo": text}, ensure_ascii=False))
    except ConnectionClosed as error:
        print("Spojení ukončeno:", type(error).__name__)
    finally:
        print("Odpojeno")


async def main():
    async with serve(
        echo, "127.0.0.1", 8765,
        origins=["http://localhost:8000"],
        max_size=1024, max_queue=8,
        ping_interval=20, ping_timeout=20, close_timeout=3,
    ) as server:
        print("Server: ws://127.0.0.1:8765")
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Server zastaven")
```

`ws_client.py`:

```python
import asyncio
import json

from websockets.asyncio.client import connect


async def main():
    async with connect(
        "ws://127.0.0.1:8765",
        origin="http://localhost:8000",
        open_timeout=5, close_timeout=3, max_size=1024,
    ) as connection:
        for message in (
            {"type": "echo", "text": "Ahoj"},
            {"type": "echo", "text": ""},
            {"type": "close"},
        ):
            await connection.send(json.dumps(message))
            async with asyncio.timeout(5):
                print(json.loads(await connection.recv()))
        await connection.wait_closed()
        print("Uzavřeno:", connection.close_code)


if __name__ == "__main__":
    asyncio.run(main())
```

Na Windows spusťte `.\.venv\Scripts\python.exe ws_server.py`; v druhém terminálu ze stejného adresáře `.\.venv\Scripts\python.exe ws_client.py`. Na macOS/Linux použijte `.venv/bin/python ws_server.py` a `.venv/bin/python ws_client.py`. Python klient posílá povolený origin výslovně; na `localhost:8000` nemusí běžet žádná webová stránka. Klient vypíše:

```text
{'echo': 'Ahoj'}
{'error': 'echo vyžaduje text o 1 až 100 znacích'}
{'message': 'Na shledanou'}
Uzavřeno: 1000
```

Server vypíše `Připojeno` a `Odpojeno`. Prostřední zpráva je aplikační chyba, spojení zůstává otevřené. Třetí zpráva spustí řádné uzavření. Server ukončíte Ctrl+C; kontextový správce zavře poslouchající server i otevřená spojení. `asyncio` střídá čekající operace; blokující výpočet nebo `time.sleep()` uvnitř obsluhy by zdržoval ostatní klienty.

Změníte-li klientův `origin` na `http://cizi.example`, handshake skončí HTTP 403 a obsluha `echo` se nespustí. Chybějící origin je zde také odmítnut. Řetězec delší než 100 znaků dostane aplikační chybu; zpráva přes 1024 bajtů překročí transportní limit a spojení se uzavře kódem 1009. Limit znaků a limit bajtů nejsou totéž, zvlášť pro Unicode. Binární zprávu server odmítá kódem 1003.

## 3. Kdy použít :id=_3-when-to-use

WebSocket se hodí, když obě strany průběžně posílají události a náklady opakovaných požadavků překážejí. Pro jednosměrné serverové události zvažte také Server-Sent Events; pro řídké změny stačí periodické HTTP dotazování.

U chráněné aplikace ověřte [session nebo token](Authentication.md) při navázání spojení a oprávnění při každé citlivé zprávě. Expirace přihlášení během otevřeného spojení se musí výslovně promítnout do ukončení nebo nového ověření. Browserový WebSocket konstruktor nedovoluje libovolné `Authorization` hlavičky; citlivý token nevkládejte do URL, kde jej mohou zachytit logy. Vyberte podporovaný autentizační postup frameworku, konkrétní povolené originy a šifrované `wss://`.

Ukázka omezuje jednotlivé zprávy a frontu, nikoli celkový počet spojení či počet zpráv za sekundu. Ve veřejném provozu potřebujete i tyto limity, politiku odpojování pomalých klientů a konfiguraci proxy pro dlouhá spojení. `ws://` je zde určeno jen pro místní loopback.

## 4. Časté chyby :id=_4-common-mistakes

- **Zaměnění originu za identitu.** Povolený origin nenahrazuje přihlášení ani oprávnění k místnosti nebo dokumentu.
- **Neomezené fronty.** Pomalý klient nesmí nutit server hromadit zprávy bez hranice; určete, zda staré zprávy zahodit, spojení ukončit nebo producenta zpomalit.
- **Ztracené odpojení.** Uvolňujte registraci klienta a jiné zdroje v `finally`; nepohlcujte neočekávané chyby aplikace jako běžný disconnect.
- **Automatické opakování změn.** Po přerušení nemusí klient vědět, zda server změnu provedl. Použijte ID operací, potvrzení a pravidla proti duplicitám, než požadavek zopakujete.

<details>
<summary>Volitelné podrobnosti: více serverů a opětovné připojení</summary>

Seznam klientů v paměti jedné instance neobsahuje spojení dalších instancí. Pro rozesílání událostí mezi nimi lze použít broker, ale samotný broker nezajišťuje historii pro odpojeného klienta. Obnovení spojení vyžaduje prodlevy s náhodnou složkou, omezení pokusů a případně poslední přijaté pořadové číslo. Trvalá historie a znovupřehrání zpráv jsou samostatné vlastnosti návrhu, které WebSocket sám neposkytuje.

</details>

## Související témata

- [HTTP a síťová komunikace](../C/Networking.md) — časové limity a selhání přenosu.
- [Autentizace](Authentication.md) — životnost přihlášení a předávání identity.
- [Middleware a routing](Middleware_a_routing.md) — HTTP middleware a ASGI spojení.


