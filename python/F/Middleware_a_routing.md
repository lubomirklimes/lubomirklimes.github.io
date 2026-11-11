# Middleware a routing

Routing vybírá obsluhu podle cesty URL a HTTP metody. Middleware obaluje zpracování požadavku společnou logikou: například identifikací, měřením času nebo logováním výsledku.

## 1. Princip :id=_1-concept

Požadavek nese metodu, cestu, hlavičky a případně tělo. Router vybere funkci, která vytvoří odpověď se stavem, hlavičkami a tělem; viz [REST API](REST_API.md). Middleware může před předáním požadavku připravit kontext a při návratu doplnit odpověď.

```text
klient → vnější middleware → vnitřní middleware → router → endpoint
klient ← vnější middleware ← vnitřní middleware ← odpověď
```

Ve FastAPI naposledy přidaný middleware tvoří vnější vrstvu. `await call_next(request)` předá řízení dovnitř a počká na odpověď. Údaje pro právě jeden požadavek patří do `request.state`, nikoli do globální proměnné: dva klienti se mohou obsluhovat souběžně. Globální logger je v pořádku, globální `current_user` není.

FastAPI používá ASGI, rozhraní pro asynchronní komunikaci mezi serverem a aplikací. Middleware `@app.middleware("http")` zpracovává HTTP, nikoli [WebSocket zprávy](WebSockets.md). Čas kolem `call_next` nezahrnuje úplné odeslání streamovaného těla klientovi.

## 2. Příklad :id=_2-example

**Samostatný příklad — `pipeline.py`:** Python 3.12 nebo novější, FastAPI a Uvicorn. V novém adresáři vytvořte izolované prostředí. Ověřte, že vybraný `py -3` nebo `python3` spouští Python alespoň 3.12. Windows PowerShell:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install fastapi uvicorn
```

macOS/Linux:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install fastapi uvicorn
```

Uložte celý soubor:

```python
import logging
import time
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("pipeline")
app = FastAPI()


@app.middleware("http")
async def request_context(request: Request, call_next):
    request.state.request_id = uuid4().hex
    request.state.steps = ["pred"]
    started = time.perf_counter()
    logger.info("pred id=%s metoda=%s", request.state.request_id, request.method)
    try:
        response = await call_next(request)
    except Exception:
        # Chybu nezaměníme za úspěch ani nevypíšeme citlivé tělo.
        logger.error("selhani id=%s", request.state.request_id)
        raise
    request.state.steps.append("po")
    response.headers["X-Request-ID"] = request.state.request_id
    response.headers["X-Pipeline"] = ",".join(request.state.steps)
    response.headers["X-Process-Time"] = f"{time.perf_counter() - started:.6f}"
    logger.info("po id=%s stav=%s", request.state.request_id, response.status_code)
    return response


@app.get("/users/me")
async def current_user():
    return {"message": "Statická cesta má přednost"}


@app.get("/users/{user_id}")
async def get_user(user_id: int, request: Request):
    request.state.steps.append("endpoint")
    if user_id != 1:
        raise HTTPException(status_code=404, detail="Uživatel nenalezen")
    return {"user_id": user_id, "request_id": request.state.request_id}
```

Z téhož adresáře spusťte Windows `.\.venv\Scripts\python.exe -m uvicorn pipeline:app --host 127.0.0.1 --port 8000`, macOS/Linux `.venv/bin/python -m uvicorn pipeline:app --host 127.0.0.1 --port 8000`. Jde o místní vývojový běh; server ukončíte Ctrl+C. Není potřeba reload ani debug režim.

V druhém terminálu spusťte následující příkazy. Na Windows použijte `curl.exe` místo `curl`, které může být aliasem PowerShellu:

```bash
curl -i http://127.0.0.1:8000/users/1
curl -i http://127.0.0.1:8000/users/2
curl -i http://127.0.0.1:8000/users/abc
curl -i http://127.0.0.1:8000/users/me
curl -i -X POST http://127.0.0.1:8000/users/1
```

| Požadavek | Výsledek |
|---|---|
| `GET /users/1` | 200, JSON `{"user_id":1,"request_id":"…"}`, `X-Pipeline: pred,endpoint,po`. |
| `GET /users/2` | 404, `{"detail":"Uživatel nenalezen"}`, stejný průchod pipeline. |
| `GET /users/abc` | 422: parametr nelze převést na celé číslo; endpoint se nespustí, `X-Pipeline: pred,po`. |
| `GET /users/me` | 200, `{"message":"Statická cesta má přednost"}`, `X-Pipeline: pred,po`. |
| `POST /users/1` | 405: cesta existuje, metoda není povolena; `X-Pipeline: pred,po`. |

Identifikátor je pokaždé jiný; v těle a hlavičce první odpovědi se shoduje. `X-Process-Time` je proměnlivý počet sekund. V serverovém terminálu uvidíte záznam `pred` a poté `po` se stejným ID. Vlastní log nezapisuje URL query, tělo, cookies ani hesla. Přístupové logy serveru a proxy nastavujte také s ohledem na citlivé údaje.

Statická cesta `/users/me` musí být zaregistrována před `/users/{user_id}`, jinak ji může pohltit parametrická cesta a validace odmítne `me` jako číslo. `HTTPException` framework převede na odpověď, která projde návratovou částí middleware. Nezachycená programátorská chyba projde větví `except`, znovu se vyvolá a server vrátí 500; tento middleware jí již vlastní hlavičky nepřidá. Jednotné hlavičky i u těchto chyb vyžadují správně umístěnou vnější ASGI vrstvu, nikoli skrytí chyby.

## 3. Kdy použít :id=_3-when-to-use

Middleware se hodí pro politiku celého provozu: identifikaci požadavků, bezpečnostní hlavičky a měření. Pravidlo „uživatel smí upravit právě tuto objednávku“ patří blíž endpointu a datům. Pro sdílené získání uživatele či služby lze ve FastAPI použít [vkládání závislostí](FastAPI.md).

Frameworky nemají zaměnitelné rozhraní:

| Framework | Místo společné logiky |
|---|---|
| Flask | `before_request`, `after_request`; data aktuálního kontextu v `g`. Úklid přes `teardown_request`, který dostává případnou chybu. |
| Django | Middleware s `__init__(get_response)` a `__call__(request)`. `MIDDLEWARE` vstupuje shora dolů, odpověď se vrací obráceně. Sync/async podpora závisí na implementaci. |
| FastAPI / Starlette | HTTP middleware zde; obecná ASGI vrstva pracuje s `scope`, `receive`, `send` a rozlišuje typ spojení. |

## 4. Časté chyby :id=_4-common-mistakes

- **Výjimka změněná na 200.** Očekávaný stav převeďte na odpovídající 4xx; neočekávané selhání zaznamenejte bezpečně a ponechte jako chybu.
- **Stav klienta v globální proměnné.** Kontext a ID konkrétního požadavku nesmí přepsat jiný požadavek.
- **Předčasné čtení celého těla.** U uploadů a streamů přidává paměťové nároky a může změnit chování příjemce.
- **CORS jako přihlášení.** CORS určuje, které webové stránky smějí v prohlížeči číst odpovědi napříč originy. Neověřuje identitu a neomezuje běžného HTTP klienta.

<details>
<summary>Volitelné podrobnosti: modulární routing a identifikátory</summary>

`APIRouter` seskupuje cesty například pod prefix `/orders`; musí být připojen přes `app.include_router(...)`. Rozdělujte podle odpovědnosti, nikoli podle každé URL. ID od klienta nepovažujte automaticky za důvěryhodné: ověřte formát a délku, nebo vytvořte vlastní jako zde. Při předávání ID dál oddělte diagnostickou identitu od nedůvěryhodného vstupu.

</details>

## Související témata

- [Logování](../C/Logging.md) — úrovně, handlery a ochrana diagnostiky.
- [Autentizace](Authentication.md) — kdo smí provést konkrétní operaci.
- [FastAPI](FastAPI.md) — parametry, validace a závislosti.

