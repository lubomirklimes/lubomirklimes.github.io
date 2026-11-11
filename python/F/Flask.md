# Flask

Flask umožňuje začít malou webovou aplikací a další části přidávat podle potřeby. Následující služba vrací pozdravy, rozlišuje parametry URL od těla požadavku a odmítá neplatný vstup.

## 1. Princip :id=_1-concept

Klient pošle **HTTP požadavek**: metodu, adresu, hlavičky a případně tělo. Server odpoví stavovým kódem, hlavičkami a tělem. `GET` slouží ke čtení, `POST` například k odeslání dat ke zpracování. JSON je textový formát pro objekty, seznamy a jednoduché hodnoty; platný JSON ještě nemusí mít očekávaný tvar. Přenos vysvětluje [HTTP a síťová komunikace](../C/Networking.md), návrh rozhraní [REST API](REST_API.md).

**Routing** vybírá funkci podle cesty a metody. Dekorátor `@app.get(...)` zaregistruje následující funkci jako obsluhu cesty. Parametr cesty `/hello/Ada` označuje část adresy; dotazový parametr za `?`, například `?style=formal`, upravuje zpracování. Flask pro požadavek zpřístupní `request`, zavolá funkci a návratovou hodnotu převede na odpověď. Slovník serializuje jako JSON; dvojice `(slovník, stav)` dovoluje určit stavový kód.

Flask je **mikroframework**: obsahuje HTTP rozhraní, routing a šablony, ale neurčuje databázi ani hotový systém uživatelů. [Django](Django.md) tyto součásti propojuje vestavěnými konvencemi. [FastAPI](FastAPI.md) se soustředí na typované API a automatickou validaci. Flask používá **WSGI**, rozhraní mezi webovým serverem a synchronní Python aplikací. Synchronní obsluha dokončí práci před vrácením odpovědi; blokující přenos či výpočet mezitím zaměstná jejího pracovníka.

## 2. Příklad :id=_2-example

**Samostatný příklad:** v novém adresáři použijte Python 3.12 nebo novější podporovaný zvoleným Flaskem. Následující příkazy vybírají řadu Flask 3.x od verze 3.1 a její dostupné opravy. Izolované prostředí oddělí balíčky od ostatních projektů.

Windows PowerShell:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install "Flask>=3.1,<4"
```

macOS/Linux:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install 'Flask>=3.1,<4'
```

Vybraný `py -3` nebo `python3` musí splňovat uvedené minimum. Celý soubor `app.py`:

```python
from flask import Flask, request
from werkzeug.exceptions import BadRequest, HTTPException

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 4096


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/hello/<name>")
def hello(name: str):
    style = request.args.get("style", "informal")
    if style not in {"informal", "formal"}:
        return {"error": "Styl musí být informal nebo formal."}, 400
    name = name.strip()
    if not 1 <= len(name) <= 40:
        return {"error": "Jméno musí mít 1 až 40 znaků."}, 400
    greeting = "Dobrý den" if style == "formal" else "Ahoj"
    return {"message": f"{greeting}, {name}!"}


@app.post("/echo")
def echo():
    if not request.is_json:
        return {"error": "Pošlete Content-Type application/json."}, 415
    try:
        data = request.get_json()
    except BadRequest:
        return {"error": "Tělo není platný JSON."}, 400
    if not isinstance(data, dict):
        return {"error": "Očekáván JSON objekt."}, 400
    name = data.get("name")
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 40:
        return {"error": "Pole name musí být text o 1 až 40 znacích."}, 400
    return {"message": f"Ahoj, {name.strip()}!"}


@app.errorhandler(HTTPException)
def http_error(error: HTTPException):
    response = error.get_response()
    response.data = app.json.dumps({"error": error.name})
    response.content_type = "application/json"
    return response
```

Kontrola `isinstance(data, dict)` je podstatná: JSON `[]`, `null` nebo `42` se také načte, ale není objektem s polem `name`. Chybějící pole, číslo místo jména a prázdný text odmítáme, nepřevádíme je potichu na řetězec. Limit těla je 4096 bajtů; větší požadavek může skončit kódem 413.

Obsluha `HTTPException` sjednotí například chyby 404 a 405 na JSON. `get_response()` zachová stav i důležité hlavičky, například `Allow` u nepovolené metody. Neočekávaná programová chyba má vést na 500 a záznam na serveru; klientovi neposílejte interní traceback. Nenahrazujte chybu úspěšnou odpovědí 200.

### Spuštění a požadavky

Z adresáře s `app.py` spusťte Windows `.\.venv\Scripts\python.exe -m flask --app app run --host 127.0.0.1 --port 5000`, macOS/Linux `.venv/bin/python -m flask --app app run --host 127.0.0.1 --port 5000`. Terminál ponechte otevřený a požadavky posílejte z druhého terminálu. Server zastavíte Ctrl+C.

Vývojový server slouží jen k místní práci. Nepřidáváme `--debug`: interaktivní debugger nesmí být dostupný cizím uživatelům. Pro nasazení zvolte produkční WSGI server a konfiguraci podle [dokumentace Flasku](https://flask.palletsprojects.com/en/stable/deploying/).

`curl` je nástroj pro HTTP požadavky. V PowerShellu používejte **`curl.exe`**, aby se nespustil stejnojmenný alias; na macOS/Linux pište `curl`. Uložte `greeting.json` v UTF-8:

```json
{"name":"Ada"}
```

PowerShell:

```powershell
curl.exe -i http://127.0.0.1:5000/health
curl.exe -i "http://127.0.0.1:5000/hello/Ada?style=formal"
curl.exe -i -X POST -H "Content-Type: application/json" --data-binary "@greeting.json" http://127.0.0.1:5000/echo
```

macOS/Linux:

```bash
curl -i http://127.0.0.1:5000/health
curl -i 'http://127.0.0.1:5000/hello/Ada?style=formal'
curl -i -X POST -H 'Content-Type: application/json' --data-binary '@greeting.json' http://127.0.0.1:5000/echo
```

`-i` zobrazí také hlavičky. Všechny tři odpovědi mají stav **200** a `Content-Type: application/json`. Jejich těla jsou postupně:

```text
{"status":"ok"}
{"message":"Dobrý den, Ada!"}
{"message":"Ahoj, Ada!"}
```

Každý řádek představuje samostatnou odpověď; mezery a zápis diakritiky pomocí `\u...` se mohou lišit. Prohlížeč na `/health` posílá GET, takže nenahrazuje POST volání.

Změňte `greeting.json` na `[]` a zopakujte POST: stav **400**, tělo `{"error":"Očekáván JSON objekt."}`. Obsah `{` vrátí **400** s `{"error":"Tělo není platný JSON."}`. S původním souborem a hlavičkou `Content-Type: text/plain` dostanete **415**. Volání `GET /echo` vrátí **405** s `{"error":"Method Not Allowed"}`, neznámá cesta **404** s `{"error":"Not Found"}`. Kódy 4xx popisují problém požadavku, 5xx selhání serveru.

## 3. Kdy použít :id=_3-when-to-use

Flask se hodí pro menší službu, interní nástroj nebo aplikaci, kde chcete datovou vrstvu a strukturu volit sami. Při růstu neřeší organizaci za vás: rozdělení rout, konfigurace a služeb potřebuje jasná pravidla. HTML stránky lze vracet přes Jinja šablony; tento příklad pracuje pouze s JSON a šablonu nepotřebuje.

## 4. Časté chyby :id=_4-common-mistakes

- **Převod libovolného vstupu přes `str()`.** Číslo nebo seznam tím získá zdání platného jména. Ověřte nejdříve tvar a typ, potom obsah.
- **Vedlejší účinky v GET.** Zápis dat nevkládejte do odkazu, který může prohlížeč předem načíst. Použijte odpovídající metodu a bezpečnostní ochrany.
- **Záměna místního serveru za nasazení.** `0.0.0.0` zpřístupní server přes další rozhraní; nezvyšuje jeho připravenost pro produkci.
- **Zachycení všech výjimek bez rozlišení.** Očekávané chyby vstupu řešte konkrétně, programové chyby logujte a opravujte. Diagnostiku popisuje [Logování](../C/Logging.md).

<details>
<summary>Volitelné podrobnosti: organizace a základní testy</summary>

Application factory je funkce vytvářející nakonfigurovanou aplikaci; usnadní oddělení vývojového a provozního nastavení. Blueprint sdružuje související routy a registruje je do aplikace. Další vrstvy přidávejte, až řeší skutečné rozdělení odpovědností.

Flask nabízí `app.test_client()`, který volá aplikaci bez síťového serveru. Automatické testy mají kontrolovat stav, JSON i hlavičky pro platné jméno, prázdný text, neobjektový JSON, chybnou syntaxi, chybějící cestu a nepovolenou metodu. Síťové spuštění ověřte také: testovací klient sám neprověří naslouchání a provozní nastavení serveru.

**Fragment — v samostatném souboru vedle výše uvedeného `app.py`:** prohlédnutí odpovědi bez serveru.

```python
from app import app

with app.test_client() as client:
    response = client.post("/echo", json={"name": "Ada"})
    print(response.status_code, response.get_json())
```

Vypíše `200 {'message': 'Ahoj, Ada!'}`. Pro soustavnou regresní kontrolu doplňte testovací nástroj a kontroly očekávaných hodnot.

</details>

## Související témata

- [Django](Django.md) — modely, migrace a vestavěná administrace.
- [FastAPI](FastAPI.md) — typované vstupy a OpenAPI.
- [Middleware a routing](Middleware_a_routing.md) — společná logika kolem požadavku.
- [Autentizace](Authentication.md) — přihlášení, cookies a ochrana změn stavu.
