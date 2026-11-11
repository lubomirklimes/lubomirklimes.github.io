# FastAPI

FastAPI propojuje HTTP rozhraní s typy Pythonu: z deklarovaných vstupů vytvoří validaci i dokumentaci. Na malém katalogu uvidíte rozdíl mezi daty v cestě, dotazu a těle požadavku i mezi chybou klienta a chybou aplikace.

## 1. Princip :id=_1-concept

**API** je programové rozhraní. Klient pošle HTTP požadavek s metodou, adresou, hlavičkami a případným tělem; server vrátí stavový kód, hlavičky a tělo. **JSON** zapisuje objekty, pole a základní hodnoty jako text. Podrobnější pravidla metod a stavů rozebírá [REST API](REST_API.md).

FastAPI používá **ASGI**: rozhraní mezi aplikačním serverem a Python aplikací, které podporuje asynchronní komunikaci i WebSocket. Server Uvicorn přijímá spojení a předává požadavky aplikaci. Oproti WSGI, synchronnímu rozhraní používanému například Flaskem, může ASGI obsluhovat i dlouho otevřená asynchronní spojení. Samotná volba ASGI ale nezaručuje rychlejší aplikační logiku.

Typová anotace běžné funkce sama vstup nekontroluje. FastAPI z anotací sestaví zpracování požadavku a **Pydantic** podle modelu převede a zkontroluje data. `BaseModel` definuje datový tvar; `Field` přidává omezení. V tomto příkladu Pydantic 2 odmítá neznámá pole a u ceny vyžaduje přímo celé číslo. Část ostatních vstupů může převádět, například text `"2"` z URL na `int`.

**Vkládání závislostí** znamená, že obsluha dostane potřebný výsledek od jiné funkce. FastAPI přes `Depends` tuto funkci zavolá, zkontroluje její vstupy a výsledek předá obsluze. Zde tak oddělíme parametry stránkování; ve větší aplikaci může závislost poskytovat například databázové spojení nebo ověřeného uživatele.

## 2. Příklad :id=_2-example

**Samostatný příklad — soubor `main.py`:** použijte Python 3.12 nebo novější a Pydantic 2. V novém adresáři `fastapi-katalog` vytvořte izolované prostředí. Příkazy níže nevyžadují aktivaci prostředí; všude volají jeho vlastní interpret.

Windows PowerShell:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install fastapi uvicorn "pydantic>=2,<3"
```

macOS/Linux:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install fastapi uvicorn 'pydantic>=2,<3'
```

`py -3` nebo `python3` musí odkazovat na Python alespoň 3.12. Vedle `.venv` uložte `main.py`. Dekorátory `@app.get` a `@app.post` přiřazují cestu a HTTP metodu obslužné funkci. Protože více požadavků může měnit společný slovník souběžně, krátké operace nad ním chrání `Lock`, zámek pro vlákna jednoho procesu:

```python
from threading import Lock
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Path, Query, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

app = FastAPI(title="Malý katalog")


class ItemIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    price_cents: int = Field(strict=True, gt=0, le=100_000_000)


class ItemOut(ItemIn):
    id: int


class Page(BaseModel):
    offset: int
    limit: int


def pagination(
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=20)] = 5,
) -> Page:
    return Page(offset=offset, limit=limit)


items: dict[int, ItemOut] = {}
lock = Lock()
next_id = 1


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/items")
def list_items(
    page: Annotated[Page, Depends(pagination)],
    q: Annotated[str, Query(max_length=100)] = "",
) -> list[ItemOut]:
    with lock:
        matches = [item for item in items.values() if q.casefold() in item.name.casefold()]
        return matches[page.offset:page.offset + page.limit]


@app.get("/items/{item_id}", responses={404: {"description": "Položka neexistuje"}})
def get_item(item_id: Annotated[int, Path(ge=1)]) -> ItemOut:
    with lock:
        item = items.get(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Položka neexistuje")
    return item


@app.post("/items", status_code=201, responses={409: {"description": "Název již existuje"}})
def create_item(item: ItemIn, response: Response) -> ItemOut:
    global next_id
    with lock:
        if any(old.name.casefold() == item.name.casefold() for old in items.values()):
            raise HTTPException(status_code=409, detail="Název již existuje")
        created = ItemOut(id=next_id, **item.model_dump())
        items[next_id] = created
        next_id += 1
    response.headers["Location"] = f"/items/{created.id}"
    return created
```

`Annotated` spojuje typ s dodatečnými pravidly. `StringConstraints` nejprve ořízne okrajové mezery a pak vyžaduje 1–100 znaků. Cena je v haléřích, aby příklad nezaměňoval desetinné peníze s nepřesným `float`. `ItemOut` rozšiřuje vstupní model o serverem přidělené ID; `model_dump()` vytvoří slovník dat. Návratové modely slouží také ke kontrole a popisu odpovědí.

Slovník je výukové úložiště **jen v paměti jednoho procesu**. Restart jej vymaže, více procesů by mělo každý jiná data. Zámek chrání společné čtení a změnu před souběhem vláken; nenahrazuje databázovou transakci ani trvalé uložení.

### Spuštění a první požadavky

Windows PowerShell:

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

macOS/Linux:

```bash
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

`main:app` znamená modul `main.py` a objekt `app` v něm. Server nechte běžet v prvním terminálu; ukončíte jej Ctrl+C. Tato konfigurace je pro místní vývoj. Veřejné nasazení vyžaduje mimo jiné TLS, správu procesů a přístupová pravidla.

V druhém terminálu Windows:

```powershell
curl.exe -i http://127.0.0.1:8000/health
Set-Content -LiteralPath item.json -Value '{"name":"Blok","price_cents":4900}' -Encoding ascii
curl.exe -i -X POST http://127.0.0.1:8000/items -H "Content-Type: application/json" --data-binary "@item.json"
curl.exe -i "http://127.0.0.1:8000/items?q=blo&limit=1"
curl.exe -i http://127.0.0.1:8000/items/1
```

macOS/Linux:

```bash
curl -i http://127.0.0.1:8000/health
curl -i -X POST http://127.0.0.1:8000/items -H 'Content-Type: application/json' --data '{"name":"Blok","price_cents":4900}'
curl -i 'http://127.0.0.1:8000/items?q=blo&limit=1'
curl -i http://127.0.0.1:8000/items/1
```

Po čerstvém startu odpoví `/health` stavem **200** a `{"status":"ok"}`. POST vrátí **201**, hlavičku `Location: /items/1` a tělo `{"name":"Blok","price_cents":4900,"id":1}`. Seznam vrátí **200** a pole s touto položkou; poslední GET vrátí **200** a samotnou položku. `Content-Type` odpovědí je `application/json`; pořadí klíčů není součástí smlouvy.

`item_id` pochází z **cesty**, `q`, `offset` a `limit` z **query stringu** za otazníkem a `item: ItemIn` z JSON **těla**. `response` naopak poskytne FastAPI; klient jej neposílá.

### Chyby a dokumentace

Zkuste následující požadavky; na Windows použijte `curl.exe`:

```bash
curl -i http://127.0.0.1:8000/items/999
curl -i 'http://127.0.0.1:8000/items?limit=0'
curl -i http://127.0.0.1:8000/items/abc
```

První vrátí **404** a `{"detail":"Položka neexistuje"}`. Další dva vrátí **422**: omezení query parametru a převod parametru cesty selhaly ještě před spuštěním obsluhy. Opakování stejného POST vrátí **409** a `{"detail":"Název již existuje"}`. Změňte v těle cenu na `0`, řetězec `"4900"` nebo přidejte neznámé pole: POST vrátí **422** a nic nevytvoří. Prázdné či pouze mezerové jméno je také neplatné.

Validační odpověď má pole `detail` se seznamem chyb. U `limit=0` najdete v `loc` umístění `["query","limit"]`; u ceny `["body","price_cents"]`. Další pole a přesný text zpráv se mohou mezi verzemi měnit. Klient má vyhodnocovat stav a dokumentovaný tvar, nikoli porovnávat celý anglický text chyby. `HTTPException` vyjadřuje očekávané HTTP odmítnutí; neočekávaná programátorská chyba patří mezi **5xx**, ne mezi validační 422.

Otevřete [interaktivní dokumentaci](http://127.0.0.1:8000/docs) a [OpenAPI schéma](http://127.0.0.1:8000/openapi.json). **OpenAPI** je strojový popis cest, parametrů, modelů a odpovědí; `/docs` nad ním poskytuje formulář pro volání API. U POST je popsán vstup `ItemIn`, odpověď 201 `ItemOut` a možná validační 422. Parametr `responses` doplňuje popis vlastní 404 a 409; jejich těla používají obálku `detail` z ukázaných odpovědí. Schéma je dostupné místně, ale výchozí stránka `/docs` načítá soubory Swagger UI z CDN, a pro jejich první načtení proto potřebuje přístup k internetu.

## 3. Kdy použít :id=_3-when-to-use

FastAPI se hodí pro rozhraní s dobře popsanými daty, automatickou dokumentací a sdílenými závislostmi. [Django](Django.md) nabízí navíc integrovaný ORM, migrace a administraci; [Flask](Flask.md) ponechává více rozhodnutí o datové vrstvě a validaci na autorovi.

`async def` použijte, když obsluha čeká přes `await` na skutečně asynchronní síťové či databázové API. Během čekání může server obsluhovat jiné požadavky. Běžné `def` FastAPI spouští ve vláknovém poolu; proto je zde používáme pro práci se synchronním zámkem. Krátký `/health` používá `async def`, ale bez čekání z něj neplyne výkonnostní výhoda. Blokující `time.sleep()`, synchronní HTTP klient ani dlouhý výpočet nepatří do asynchronní obsluhy přímo: zablokovaly by smyčku událostí. Výpočetně náročná práce potřebuje samostatné řešení, například pracovní proces.

## 4. Časté chyby :id=_4-common-mistakes

- **Považovat typy za obchodní pravidla.** Pydantic zkontroluje tvar a omezení; existenci položky a kolizi názvu musí rozhodnout aplikace.
- **Vracet vstupní model se soukromými poli.** Pro výstup určete samostatný model a zveřejňujte jen zamýšlená data.
- **Vše označit `async`.** Volte podle používaných operací, nikoli podle názvu frameworku.
- **Spoléhat na globální slovník při nasazení.** Trvalá data a souběžné zápisy řešte databází; ověření identity patří do [autentizace](Authentication.md).

<details>
<summary>Volitelné podrobnosti: smlouva API a ověřování</summary>

OpenAPI není důkaz správnosti implementace. Při změně modelu kontrolujte platný požadavek, hraniční hodnoty, chybějící položku, konflikt i návratový tvar. Pro testy bez síťového serveru FastAPI poskytuje `TestClient`; skutečné spuštění Uvicornu navíc ověřuje importní cestu a nastavení serveru. Výstupní validace odhalující chybný serverový výsledek znamená chybu aplikace, nikoli chybu klienta.

</details>

## Související témata

- [Typování v Pythonu](../B/Typovani_v_Pythonu.md) — anotace a jejich běžné meze.
- [REST API](REST_API.md) — metody, stavové kódy a návrh zdrojů.
- [Middleware a routing](Middleware_a_routing.md) — společné zpracování požadavku.


