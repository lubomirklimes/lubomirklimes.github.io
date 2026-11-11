# REST API

Předvídatelné HTTP rozhraní umožní klientovi vytvořit úkol, získat jeho stav a rozumně reagovat na chybu. Návrh spočívá ve významu adres, metod a odpovědí; samotné použití JSON z rozhraní REST neudělá.

## 1. Princip :id=_1-concept

**Zdroj** je věc, se kterou klient pracuje, například úkol na `/v1/tasks/1`. **Reprezentace** je jeho přenášený popis, zde JSON objekt. JSON je textový formát pro objekty, pole a základní hodnoty. URI identifikuje zdroj, metoda určuje operaci. HTTP požadavek obsahuje metodu, adresu, hlavičky a případné tělo; odpověď stav, hlavičky a případné tělo. `Content-Type` říká, jaký formát tělo používá.

REST je architektonický styl se zdroji, jednotným rozhraním, oddělením klienta a serveru, bezstavovými požadavky, pravidly mezipaměti a vrstvami. Bezstavovost znamená, že požadavek nese potřebný kontext; neznamená zákaz databáze. Plné REST rozhraní navíc vede klienta odkazy mezi reprezentacemi. Následující malá služba ukazuje HTTP návrh inspirovaný REST; nepředstavuje všechny jeho podmínky.

| Metoda | Význam | Bezpečná / idempotentní |
|---|---|---|
| GET | Čtení reprezentace. | Ano / ano. |
| POST | Například vytvoření potomka v kolekci. | Ne / obecně ne. |
| PUT | Úplná náhrada stavu na známé adrese. | Ne / ano. |
| PATCH | Částečná změna podle určeného formátu. | Ne / záleží na operaci. |
| DELETE | Odstranění vazby zdroje na adresu. | Ne / ano. |

**Bezpečná metoda** nemá žádaný měnící účinek; provozní logování GET tomu neodporuje. **Idempotence** znamená stejný zamýšlený účinek opakování stejného požadavku, nikoli stejný text či status každé odpovědi. Druhý DELETE tedy může vrátit 404, i když první vrátil 204. Přidání jednoho kusu přes PATCH idempotentní není; nastavení konkrétní hodnoty být může. POST po síťovém timeoutu neopakujte slepě: server již mohl operaci dokončit. U důležitých operací navrhněte deduplikaci podle klíče požadavku.

| Stav | Kdy jej použít |
|---|---|
| 200 OK | Úspěšné čtení nebo změna s reprezentací. |
| 201 Created | Nový zdroj; `Location` ukáže jeho adresu. |
| 204 No Content | Úspěch bez těla, například smazání. |
| 400 Bad Request | Chybně zapsaný požadavek, například porušený JSON. |
| 401 Unauthorized | Chybějící nebo neplatné přihlašovací údaje; patří k němu výzva `WWW-Authenticate`. |
| 403 Forbidden | Server přístup zakázal; typicky identitu zná, ale právo chybí. |
| 404 Not Found | Zdroj nebyl nalezen, případně server nechce odhalit jeho existenci. |
| 409 Conflict | Platná data jsou v konfliktu s aktuálním stavem. |
| 422 Unprocessable Content | Tělo je syntakticky čitelné, ale nesplňuje pravidla dat. |

4xx označují problém požadavku či oprávnění; 5xx selhání serveru. Volbu 400 proti 422 stanovte konzistentně. Příklad níže používá 400 pro JSON syntaxi a query parametry, 422 pro tvar a obsah JSON dat. Přístupové stavy 401 a 403 ukazuje samostatně [autentizace](Authentication.md); tato služba žádné přihlášení nemá.

## 2. Příklad :id=_2-example

**Samostatný příklad — `api.py`:** služba seznamu úkolů používá Flask, aby vyniklo HTTP chování. Základy frameworku najdete v [kapitole Flask](Flask.md). Potřebujete Python 3.12 nebo novější. V novém adresáři `rest-ukoly` vytvořte prostředí:

Windows PowerShell:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install Flask
```

macOS/Linux:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install Flask
```

Příkaz pro vytvoření prostředí musí používat Python alespoň 3.12. Vedle `.venv` vytvořte `api.py`. Dekorátory přiřadí metodu a cestu funkci. `Lock` je zámek, který během krátké operace nad společným slovníkem pustí dovnitř jen jedno vlákno:

```python
from threading import Lock

from flask import Flask, abort, jsonify, request
from werkzeug.exceptions import HTTPException

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 4096
tasks: dict[int, dict] = {}
lock = Lock()
next_id = 1


@app.errorhandler(HTTPException)
def http_error(error):
    response = error.get_response()
    response.data = app.json.dumps({"error": {
        "code": f"http_{error.code}", "message": error.description,
    }})
    response.content_type = "application/json"
    return response


@app.after_request
def cache_policy(response):
    response.headers["Cache-Control"] = "no-store"
    return response


def task_input(*, replacing=False):
    data = request.get_json()
    required = {"title", "done"} if replacing else {"title"}
    if not isinstance(data, dict) or set(data) != required:
        abort(422, description="Tělo musí obsahovat přesně požadovaná pole")
    title = data["title"]
    if not isinstance(title, str) or not 1 <= len(title.strip()) <= 80:
        abort(422, description="Název musí mít 1 až 80 znaků")
    if replacing and not isinstance(data["done"], bool):
        abort(422, description="Pole done musí být boolean")
    return {"title": title.strip(), "done": data.get("done", False)}


def require_task(task_id):
    if task_id not in tasks:
        abort(404, description="Úkol neexistuje")
    return tasks[task_id]


def check_duplicate(title, own_id=None):
    if any(t["title"].casefold() == title.casefold() and i != own_id
           for i, t in tasks.items()):
        abort(409, description="Úkol s tímto názvem již existuje")


@app.get("/v1/tasks")
def list_tasks():
    try:
        offset = int(request.args.get("offset", "0"))
        limit = int(request.args.get("limit", "10"))
    except ValueError:
        abort(400, description="offset a limit musí být celá čísla")
    if offset < 0 or not 1 <= limit <= 20:
        abort(400, description="offset musí být nezáporný a limit 1 až 20")
    q = request.args.get("q", "").casefold()
    if len(q) > 80:
        abort(400, description="Filtr smí mít nejvýše 80 znaků")
    with lock:
        found = [t.copy() for t in tasks.values() if q in t["title"].casefold()]
    return jsonify({"items": found[offset:offset + limit],
                    "total": len(found), "offset": offset, "limit": limit})


@app.post("/v1/tasks")
def create_task():
    global next_id
    data = task_input()
    with lock:
        check_duplicate(data["title"])
        task = {"id": next_id, **data}
        tasks[next_id] = task
        next_id += 1
    response = jsonify(task)
    response.status_code = 201
    response.headers["Location"] = f"/v1/tasks/{task['id']}"
    return response


@app.get("/v1/tasks/<int:task_id>")
def get_task(task_id):
    with lock:
        task = require_task(task_id).copy()
    return jsonify(task)


@app.put("/v1/tasks/<int:task_id>")
def replace_task(task_id):
    data = task_input(replacing=True)
    with lock:
        require_task(task_id)
        check_duplicate(data["title"], own_id=task_id)
        task = {"id": task_id, **data}
        tasks[task_id] = task
    return jsonify(task)


@app.delete("/v1/tasks/<int:task_id>")
def delete_task(task_id):
    with lock:
        require_task(task_id)
        del tasks[task_id]
    return "", 204
```

Pomocné funkce pro vyhledání a kontrolu duplicity se volají uvnitř zámku; vytvoření i náhrada tak kontrolují společný stav před jeho změnou. Zámek řeší vlákna jednoho procesu. **Data jsou výukově v paměti, restart je smaže** a více procesů je nesdílí. Veřejné API potřebuje trvalé úložiště, přístupová práva a další provozní limity. Tělo je zde omezeno na 4096 bajtů; překročení vrátí 413. Nesprávný `Content-Type` při čtení JSON vrátí 415.

`HTTPException` je očekávaná HTTP chyba Flasku. Handler zachovává její status a hlavičky, například `Allow` u 405, a mění tělo na jednotný JSON. Neočekávané výjimky neskrývá pod úspěšnou odpověď; Flask je zaznamená a při vypnutém debug režimu vrátí obecnou 500.

Spusťte server v prvním terminálu na Windows:

```powershell
.\.venv\Scripts\python.exe -m flask --app api run --host 127.0.0.1 --port 8001
```

macOS/Linux:

```bash
.venv/bin/python -m flask --app api run --host 127.0.0.1 --port 8001
```

Jde o místní vývojový server bez debug režimu; ukončete jej Ctrl+C. Pro veřejné nasazení zvolte produkční aplikační server a HTTPS.

### Vytvoření, čtení a změna

V druhém terminálu spusťte následující kroky po čerstvém startu. `-i` zobrazí i hlavičky. **Windows PowerShell:** používejte `curl.exe`, protože `curl` může v některých verzích označovat jiný příkaz. Těla uložte do souborů, aby rozdíly v předávání uvozovek nepozměnily JSON:

```powershell
Set-Content -LiteralPath task.json -Value '{"title":"Studium Pythonu"}' -Encoding ascii
Set-Content -LiteralPath replacement.json -Value '{"title":"Studium Pythonu","done":true}' -Encoding ascii
curl.exe -i -X POST http://127.0.0.1:8001/v1/tasks -H "Content-Type: application/json" --data-binary "@task.json"
curl.exe -i http://127.0.0.1:8001/v1/tasks/1
curl.exe -i "http://127.0.0.1:8001/v1/tasks?q=pythonu&offset=0&limit=1"
curl.exe -i -X PUT http://127.0.0.1:8001/v1/tasks/1 -H "Content-Type: application/json" --data-binary "@replacement.json"
```

macOS/Linux:

```bash
curl -i -X POST http://127.0.0.1:8001/v1/tasks -H 'Content-Type: application/json' --data '{"title":"Studium Pythonu"}'
curl -i http://127.0.0.1:8001/v1/tasks/1
curl -i 'http://127.0.0.1:8001/v1/tasks?q=pythonu&offset=0&limit=1'
curl -i -X PUT http://127.0.0.1:8001/v1/tasks/1 -H 'Content-Type: application/json' --data '{"title":"Studium Pythonu","done":true}'
```

Významné části odpovědí, bez proměnlivých provozních hlaviček:

```text
POST /v1/tasks → 201 Created
Location: /v1/tasks/1
Content-Type: application/json
Cache-Control: no-store
{"id":1,"title":"Studium Pythonu","done":false}

GET /v1/tasks/1 → 200 OK
{"id":1,"title":"Studium Pythonu","done":false}

GET /v1/tasks?q=pythonu&offset=0&limit=1 → 200 OK
{"items":[{"id":1,"title":"Studium Pythonu","done":false}],"total":1,"offset":0,"limit":1}

PUT /v1/tasks/1 → 200 OK
{"id":1,"title":"Studium Pythonu","done":true}
```

Pořadí klíčů JSON není významné. `offset` přeskočí počet výsledků, `limit` omezí velikost stránky a `q` filtruje názvy bez rozlišení velikosti písmen. `total` je počet všech odpovídajících úkolů před stránkováním. Pořadí odpovídá vytvoření; ve větší databázi stanovte stabilní řazení. Při souběžných změnách může offset přeskočit či zopakovat položky; pro velké měnící se kolekce se hodí stránkování podle kurzoru, tedy identifikátoru pokračování.

PUT vyžaduje obě pole a nahrazuje celý měnitelný stav; tento kontrakt pouze upravuje existující úkol a při neexistenci vrací 404. Nemusí každé API povolovat vytváření přes PUT. Částečnou aktualizaci PATCH zde služba neposkytuje.

### Konflikt, neplatná data a smazání

Než úkol smažete, zopakujte původní POST: vrátí **409** a tělo:

```json
{"error":{"code":"http_409","message":"Úkol s tímto názvem již existuje"}}
```

Pošlete jako tělo POST `[]` nebo `{"title":" "}`: dostanete **422**. Poškozený JSON `{` vrátí **400**. Všechny tyto HTTP chyby mají stejnou obálku `error` s `code` a `message`; konkrétní zprávu 400 z parseru nepoužívejte jako strojový identifikátor. `GET /v1/tasks?limit=0` vrátí **400** s `code: "http_400"` a zprávou `offset musí být nezáporný a limit 1 až 20`.

Na macOS/Linux:

```bash
curl -i -X POST http://127.0.0.1:8001/v1/tasks -H 'Content-Type: application/json' --data '[]'
curl -i -X POST http://127.0.0.1:8001/v1/tasks -H 'Content-Type: application/json' --data '{'
curl -i -X DELETE http://127.0.0.1:8001/v1/tasks/1
curl -i -X DELETE http://127.0.0.1:8001/v1/tasks/1
curl -i http://127.0.0.1:8001/v1/tasks/1
```

Na Windows nahraďte `curl` příkazem `curl.exe`; pro těla znovu použijte `Set-Content` a `--data-binary "@task.json"`. První DELETE vrátí **204** a žádné tělo. Druhý DELETE a poslední GET vrátí **404** a `{"error":{"code":"http_404","message":"Úkol neexistuje"}}`. Prázdná kolekce je naproti tomu **200** s `items: []`, ne 404.

## 3. Kdy použít :id=_3-when-to-use

Tento styl vyhovuje rozhraním pro webové či mobilní klienty a integrace, které pracují se zdroji a jejich stavem. Kontrakt dokumentujte včetně neúspěchů. [FastAPI](FastAPI.md) umí část popisu generovat jako OpenAPI; ani vygenerované schéma ale samo nevysvětlí obchodní pravidla.

Prefix `/v1` odděluje tuto verzi kontraktu. Novou hlavní verzi zavádějte kvůli nekompatibilní změně, ne při každém přidání volitelného pole. Klienti mají tolerovat nové výstupní položky, pokud tak zní dohoda; server naopak může odmítat neznámá vstupní pole, jako tento příklad. Změna významu existujícího pole může rozbít klienta i bez změny JSON tvaru.

**Mezipaměť HTTP** může znovu použít odpověď podle hlaviček. Zde `Cache-Control: no-store` říká, aby se odpovědi neukládaly; nepředstavuje šifrování ani oprávnění. U vhodných čtených reprezentací lze místo toho určit dobu platnosti a validátor `ETag`. Klient pošle `If-None-Match`; nezměněná reprezentace může dostat **304** bez těla. Implementace musí zohlednit změny dat, varianty reprezentace i oprávnění. Citlivá odpověď nesmí omylem skončit ve sdílené cache.

## 4. Časté chyby :id=_4-common-mistakes

- **Změna dat přes GET.** Prohlížeče a prostředníci jej mohou načíst předem nebo opakovat. Zvolte metodu se správným významem.
- **Vše vracet jako 200.** Klient pak nerozpozná konflikt od úspěchu. Zachovejte odpovídající stav a konzistentní chybu.
- **Tělo u 204.** Po úspěšném DELETE bez reprezentace neposílejte ani prázdný JSON objekt.
- **Zaměnit validaci s oprávněním.** Správně tvarované ID nedává právo cizí úkol přečíst. Oprávnění kontrolujte pro konkrétní zdroj.

<details>
<summary>Volitelné podrobnosti: souběžné úpravy a HTTP podmínky</summary>

Pokud dva klienti přečtou stejný úkol a pak každý odešle PUT, poslední zápis může přepsat změnu prvního. Vedle databázové transakce lze nabídnout validátor reprezentace `ETag` a požadovat `If-Match`. Neodpovídající podmínka vede na 412 Precondition Failed, takže klient musí načíst nový stav a rozhodnout o sloučení. Jde o jiný problém než idempotence: opakování jedné náhrady a konflikt dvou rozdílných náhrad nejsou totéž. Tento příklad podmíněné požadavky neimplementuje.

</details>

## Související témata

- [HTTP a síťová komunikace](../C/Networking.md) — klient, timeout a čtení odpovědi.
- [Flask](Flask.md) — obsluha požadavku a validace JSON.
- [Autentizace](Authentication.md) — identita, práva, cookies a tokeny.


