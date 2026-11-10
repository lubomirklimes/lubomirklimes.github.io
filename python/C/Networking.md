<span id="networking"></span>

# HTTP a síťová komunikace

HTTP klient odesílá požadavek a čte odpověď se stavovým kódem, hlavičkami a tělem. Úspěšný přenos ještě nezaručuje úspěch aplikace ani správný obsah.

## Princip :id=_1-concept

Síťové selhání, HTTP chybový stav a neplatná data jsou odlišné situace. `http.client` nevyvolá výjimku jen proto, že server vrátil 404 nebo 503; stav musíte posoudit. Kódy 4xx označují chybu požadavku (například 404 — nenalezeno), 5xx problém na straně serveru (například 503 — služba nedostupná). U requests kontrolu 4xx/5xx provádí `raise_for_status()`. Ani úspěšné `json()` nepotvrzuje očekávané klíče a typy.

Nastavte časový limit (timeout) blokujících operací, omezte velikost čteného těla a určete vlastníka spojení. Socketový timeout není pevný celkový rozpočet celého požadavku; více čtení a pomalu přicházející data mohou běh prodloužit. Produkční klient může potřebovat celkový časový limit, limity a koordinované zrušení.

## První požadavek

`urllib.request` je klient standardní knihovny. **Fragment — vyžaduje přístup k internetu:** tento samostatně spustitelný blok načte veřejnou ukázkovou stránku `https://example.com/`. API je programové rozhraní služby. Pro API zvolte jeho dokumentovanou adresu; před odesláním citlivých údajů ověřte doménu.

```python
from urllib.request import urlopen
from urllib.error import HTTPError, URLError

try:
    with urlopen("https://example.com/", timeout=5) as response:
        body = response.read(4097)
        if len(body) > 4096:
            raise ValueError("Stránka překročila limit 4096 bajtů")
        print("HTTP:", response.status)
        print("Obsahuje Example Domain:", "Example Domain" in body.decode("utf-8"))
except HTTPError as error:
    print("HTTP chyba:", error.code)
except URLError as error:
    print("Přenos selhal:", error.reason)
except TimeoutError:
    print("Vypršel čas přenosu")
except ValueError as error:
    print(error)
```

Při běžné odpovědi se vypíše `HTTP: 200` a `Obsahuje Example Domain: True`. Obsah i dostupnost cizího serveru se mohou měnit. `HTTPError` znamená HTTP chybový stav, `URLError` například selhání překladu domény nebo připojení. HTML tělo zde nezpracováváme jako JSON.

## Příklad na lokálním serveru :id=_2-example

Následující **dva bloky tvoří jeden soubor `http_demo.py` společně**. První připraví pomocný lokální server, druhý klienta a jeho volání. Oba bloky jsou povinné a patří do jednoho souboru v uvedeném pořadí. Server slouží jen jako protistrana: používá dědičnost HTTP obsluhy, vlákno pro souběžný běh a správce prostředků `contextmanager`, jehož `yield` vymezí dobu používání serveru. Pro učení klienta stačí pomocný blok zkopírovat. Server poslouchá jen na `127.0.0.1`, port 0 nechá vybrat volný port. Server slouží k místnímu procvičení chybových stavů; pro nasazení zvolte aplikační server.


**Část 1 souboru `http_demo.py`:** součást úplného příkladu níže. Varianty vracejí HTTP chybu, špatný JSON, nesprávný tvar a příliš velké tělo; zpoždění umožní ukázat vypršení časového limitu.

```python
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from time import sleep

class DemoHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/slow":
            sleep(0.25)
        status, body = {
            "/error": (503, b'{"error":"temporary"}'),
            "/bad": (200, b"{"),
            "/shape": (200, b"[]"),
            "/large": (200, b"x" * 1025),
        }.get(self.path, (200, b'{"message":"ahoj"}'))
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except OSError:
            print("Klient již ukončil spojení")

@contextmanager
def demo_server():
    with ThreadingHTTPServer(("127.0.0.1", 0), DemoHandler) as server:
        worker = Thread(target=server.serve_forever)
        worker.start()
        try:
            yield server.server_address
        finally:
            server.shutdown()
            worker.join()
```


**Část 2 souboru `http_demo.py`:** připojte za první blok. `finally` zavře spojení i při chybě statusu, čtení nebo parsování. Limit je pro tuto malou odpověď 1024 bajtů.

```python
import http.client
import json

def fetch_message(address: tuple[str, int], path: str, timeout: float = 2) -> str:
    connection = http.client.HTTPConnection(*address, timeout=timeout)
    try:
        connection.request("GET", path)
        with connection.getresponse() as response:
            if response.status != 200:
                raise ValueError(f"Neočekávaný HTTP stav: {response.status}")
            if response.getheader("Content-Type", "").split(";")[0] != "application/json":
                raise ValueError("Očekáván JSON")
            body = response.read(1025)
        if len(body) > 1024:
            raise ValueError("Odpověď překročila limit")
        value = json.loads(body.decode("utf-8"))
        if not isinstance(value, dict) or not isinstance(value.get("message"), str):
            raise ValueError("Očekáván objekt s textovým message")
        return value["message"]
    finally:
        connection.close()

with demo_server() as address:
    print(fetch_message(address, "/ok"))
    for path in ("/error", "/bad", "/shape", "/large"):
        try:
            fetch_message(address, path)
        except json.JSONDecodeError:
            print(f"{path}: Neplatný JSON")
        except ValueError as error:
            print(f"{path}: {error}")
    try:
        fetch_message(address, "/slow", timeout=0.05)
    except TimeoutError:
        print("Vypršel timeout")
```

Stdout klienta (pomocný server navíc zapisuje na stderr a po timeoutu může přidat zprávu o ukončeném spojení):

```text
ahoj
/error: Neočekávaný HTTP stav: 503
/bad: Neplatný JSON
/shape: Očekáván objekt s textovým message
/large: Odpověď překročila limit
Vypršel timeout
```

Výstup rozlišuje HTTP stav 503, neplatný JSON, chybný tvar dat, překročení velikosti a vypršení času. Tento dvoudílný příklad komunikuje pouze uvnitř počítače. Pomocný server navíc zapisuje požadavky na stderr; po timeoutu může vypsat `Klient již ukončil spojení`. `HTTPException` označuje také chyby protokolu a `OSError` chyby transportu; volající je má obsloužit podle politiky aplikace, nikoli všechny převést na prázdný úspěšný výsledek.

## Volba klienta a opakování :id=_3-when-to-use

Standardní `urllib.request` nabízí vyšší úroveň než `http.client`. Requests usnadňuje práci s relacemi (Session), parametry a odpovědí, ale je externí závislost. Pro volitelnou variantu instalujte do prostředí projektu `python -m pip install requests` podle [úvodu](../A/Uvod_do_Pythonu.md).

**Fragment — vyžaduje requests a definice serveru z části 1:** připojte jej za pomocný server nebo za celý `http_demo.py`. Samotný fragment vypíše `ahoj`. Čte malou známou odpověď; u neomezených dat použijte postupné čtení (`stream=True`) s limitem.

```python
import requests

with demo_server() as address:
    host, port = address
    with requests.Session() as session:
        try:
            with session.get(f"http://{host}:{port}/ok", timeout=(2, 2)) as response:
                response.raise_for_status()
                value = response.json()
                if not isinstance(value, dict) or not isinstance(value.get("message"), str):
                    raise ValueError("Neočekávaný tvar JSON")
                print(value["message"])
        except requests.Timeout as exc:
            raise RuntimeError("Vypršel čas síťové operace") from exc
        except requests.exceptions.JSONDecodeError as exc:
            raise ValueError("Neplatný JSON") from exc
        except requests.RequestException as exc:
            raise RuntimeError("HTTP přenos selhal") from exc
```

Timeout dvojice requests určuje připojení a čtení, nikoli součet celé operace. Chybu JSON nebo schématu řešte zvlášť od transportní chyby. Session spravuje opakovaně použitelná spojení a její `with` je uzavře; u `stream=True` je nutné odpověď dočíst nebo zavřít, aby spojení nezůstalo obsazené.

Retry znamená opakování po vybraném dočasném selhání. Omezte počet pokusů, použijte odstup a respektujte aplikační smlouvu a případný `Retry-After`. GET bývá vhodnější než operace s vedlejším účinkem. Timeout po POST neříká, zda server změnu provedl; bez dohody, že opakování stejného požadavku má stejný účinek jako jediné volání (idempotence), může opakování vytvořit duplicity. Chyby schématu či trvalou 4xx chybu neopraví slepé opakování.

## Časté chyby :id=_4-common-mistakes

U veřejné služby se přidává DNS (překlad doménového jména na adresu), TLS (šifrování a ověření protistrany) a případné přihlášení. Pro skutečné API použijte HTTPS s běžným ověřováním certifikátu; nevypínejte je kvůli odstranění chyby. `http.client.HTTPSConnection` má jiný transport než zdejší místní příklad.

Nelogujte tokeny, celé autorizační hlavičky ani citlivé tělo. Diagnostice pomůže metoda, cílová služba, stav a korelační identifikátor. Povolování libovolné URL od uživatele vyžaduje další pravidla přístupu; tento klient není obecná brána k síti.

## Související témata

- [Serializace](Serializace.md) — parsování vs validace dat.
- [Práce s procesy](Prace_s_procesy.md) — timeout a životnost operace.
- [Logování](Logging.md) — užitečné záznamy bez citlivých argumentů.
