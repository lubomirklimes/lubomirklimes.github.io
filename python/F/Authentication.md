# Authentication

Autentizace ověřuje totožnost uživatele. Autorizace rozhoduje, co smí udělat. Přihlášený čtenář může vidět profil, ale nesmí otevřít administraci. Chybějící platné přihlášení zde vede na 401, nedostatečné oprávnění na 403.

## 1. Princip :id=_1-concept

Hesla neukládejte jako prostý text ani jako rychlý SHA-256 otisk. Použijte udržovanou knihovnu s heslovým algoritmem, například scrypt či Argon2, náhodnou solí a vhodnými náklady výpočtu. Sůl zajistí odlišné uložené otisky i pro stejná hesla. Knihovna má také ověřit heslo proti uloženému záznamu; vlastní kryptografii nepište.

Po přihlášení lze totožnost předávat dvěma běžnými způsoby:

- **Session a cookie:** prohlížeč automaticky posílá cookie příslušnému serveru. Často obsahuje náhodné ID a stav je na serveru. Výchozí Flask session však ukládá podepsaná data přímo v cookie: klient je může přečíst, ale bez tajného klíče nemá být schopen platně změnit podpis. Podpis není šifrování; hesla do session nepatří.
- **Bearer token:** klient výslovně přidává například `Authorization: Bearer …`. Kdo token získá, může jej použít do skončení platnosti nebo revokace. Token nemusí být JWT. JWT je formát podepsaných tvrzení; není automaticky tajný ani bezpečnější než session.

**TLS** šifruje přenos (`https://`, u WebSocketu `wss://`). `HttpOnly` zakazuje JavaScriptu číst cookie, ale nezastaví škodlivý skript v odesílání požadavků. `Secure` omezuje posílání cookie na HTTPS. `SameSite=Lax` omezuje posílání mezi různými weby, nenahrazuje však ochranu proti **CSRF**: útoku, kdy cizí stránka vyvolá změnu s automaticky přiloženou cookie oběti. Server má u změn ověřovat CSRF token svázaný se session, včetně přihlášení a odhlášení.

## 2. Příklad :id=_2-example

**Úplná místní ukázka — dva soubory `auth_app.py` a `auth_client.py`:** Python 3.12+, Flask, Flask-WTF a Werkzeug. Flask-WTF poskytuje CSRF ochranu, Werkzeug vytváří a ověřuje scrypt otisk. Následující API používá rozhraní Flask 3.x a Flask-WTF 1.x.

V novém prázdném adresáři připravte prostředí. Ověřte, že vybraný `py -3` nebo `python3` spouští Python alespoň 3.12. Windows PowerShell:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install flask flask-wtf
```

macOS/Linux:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install flask flask-wtf
```

`auth_app.py` — jednorázový účet `eva` s rolí čtenáře. Při spuštění si zvolíte vlastní místní heslo; není zapsáno do souboru. Server po vytvoření aplikace uchovává jeho otisk. Podpisový klíč vzniká náhodně při každém startu.

```python
from datetime import timedelta
from getpass import getpass
import secrets

from flask import Flask, request, session
from flask_wtf.csrf import CSRFError, CSRFProtect, generate_csrf
from werkzeug.security import check_password_hash, generate_password_hash


def create_app(password: str) -> Flask:
    if not 12 <= len(password) <= 256:
        raise ValueError("Zvolte heslo o 12 až 256 znacích.")
    password_hash = generate_password_hash(password, method="scrypt")
    app = Flask(__name__)
    app.config.update(
        SECRET_KEY=secrets.token_bytes(32),
        MAX_CONTENT_LENGTH=4096,
        SESSION_COOKIE_NAME="local_auth_demo",
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=False,  # Výhradně místní HTTP ukázka.
        PERMANENT_SESSION_LIFETIME=timedelta(minutes=5),
        SESSION_REFRESH_EACH_REQUEST=False,
    )
    CSRFProtect(app)

    @app.after_request
    def no_cache(response):
        response.headers["Cache-Control"] = "no-store"
        if response.status_code == 401:
            response.headers["WWW-Authenticate"] = 'Session realm="local-demo"'
        return response

    @app.errorhandler(CSRFError)
    def csrf_error(error):
        return {"error": "Neplatný CSRF token"}, 400

    @app.get("/csrf")
    def csrf():
        return {"csrf_token": generate_csrf()}

    @app.post("/login")
    def login():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return {"error": "Očekáván JSON objekt"}, 400
        name, supplied = data.get("username"), data.get("password")
        if not isinstance(supplied, str) or len(supplied) > 256:
            return {"error": "Neplatné údaje"}, 400
        valid_password = check_password_hash(password_hash, supplied)
        if name != "eva" or not valid_password:
            return {"error": "Neplatné přihlášení"}, 401
        session.clear()
        session["username"] = "eva"
        session["role"] = "reader"
        session.permanent = True
        return {"message": "Přihlášeno"}

    @app.get("/me")
    def me():
        if "username" not in session:
            return {"error": "Přihlaste se"}, 401
        return {"username": session["username"], "role": session["role"]}

    @app.get("/admin")
    def admin():
        if "username" not in session:
            return {"error": "Přihlaste se"}, 401
        if session.get("role") != "admin":
            return {"error": "Nedostatečné oprávnění"}, 403
        return {"message": "Administrace"}

    @app.post("/logout")
    def logout():
        session.clear()
        return {"message": "Odhlášeno"}

    return app


if __name__ == "__main__":
    app = create_app(getpass("Zvolte místní heslo (12 až 256 znaků): "))
    app.run(host="127.0.0.1", port=5001, debug=False)
```

Windows spusťte `.\.venv\Scripts\python.exe auth_app.py`, macOS/Linux `.venv/bin/python auth_app.py`. Zadejte heslo pro tento běh. V druhém terminálu spusťte klienta stejným interpretem: Windows `.\.venv\Scripts\python.exe auth_client.py`, macOS/Linux `.venv/bin/python auth_client.py`. Zadejte stejné heslo. Klient používá standardní knihovnu: `CookieJar` uchová cookies, `HTTPError` dovolí přečíst i tělo neúspěšné HTTP odpovědi.

`auth_client.py`:

```python
from getpass import getpass
from http.cookiejar import CookieJar
import json
from urllib.error import HTTPError
from urllib.request import build_opener, HTTPCookieProcessor, Request

client = build_opener(HTTPCookieProcessor(CookieJar()))
base = "http://127.0.0.1:5001"


def call(path, payload=None, csrf=None):
    headers = {"Content-Type": "application/json"}
    if csrf:
        headers["X-CSRFToken"] = csrf
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    req = Request(base + path, data=body, headers=headers)
    try:
        response = client.open(req, timeout=5)
    except HTTPError as error:
        response = error
    with response:
        result = json.load(response)
        if path != "/csrf":
            print(req.get_method(), path, response.status, result)
        return result


call("/me")
call("/login", {"username": "eva", "password": "bez-tokenu-neprojde"})
token = call("/csrf")["csrf_token"]
call("/login", {"username": "eva", "password": getpass("Místní heslo: ")}, token)
call("/me")
call("/admin")
token = call("/csrf")["csrf_token"]
call("/logout", {}, token)
call("/me")
```

Při správném hesle uvidíte:

```text
GET /me 401 {'error': 'Přihlaste se'}
POST /login 400 {'error': 'Neplatný CSRF token'}
POST /login 200 {'message': 'Přihlášeno'}
GET /me 200 {'role': 'reader', 'username': 'eva'}
GET /admin 403 {'error': 'Nedostatečné oprávnění'}
POST /logout 200 {'message': 'Odhlášeno'}
GET /me 401 {'error': 'Přihlaste se'}
```

Odpovědi 401 obsahují `WWW-Authenticate: Session realm="local-demo"`. `Session` je zde vlastní schéma místního API: klient má provést popsaný CSRF/login postup; nejde o standardní Basic či Bearer přihlášení ani automatický dialog prohlížeče.

Chybné heslo s platným CSRF tokenem vrátí 401 `{"error":"Neplatné přihlášení"}`. Po přihlášení se stará session vymaže, proto klient získá pro odhlášení nový CSRF token. Role vzniká na serveru; údaj `"role":"admin"` přidaný do přihlašovacího JSON ji nezmění. Server ukončíte Ctrl+C.

**Omezení:** toto je místní výuková aplikace bez registrace, obnovy hesla, vícefaktorového ověření a omezení přihlašovacích pokusů. Nepublikujte ji. `Secure=False` slouží pouze pro HTTP na loopbacku; nasazený web potřebuje HTTPS a `Secure=True`. Restart změní klíč a zneplatní všechny cookies. Vymazání cookie při logout odhlásí tohoto klienta, ale samo nezneplatní dříve zkopírovanou podepsanou cookie: ta může platit do expirace. Pro okamžité odvolání přihlášení použijte serverové session s revokací nebo zavedený systém, například [Django auth](Django.md).

## 3. Kdy použít :id=_3-when-to-use

Session cookie bývá vhodná pro vlastní web ve stejném originu. **Origin** je kombinace schématu, hostitele a portu; odlišný port už znamená jiný origin. CORS je browserová politika povoleného čtení napříč originy, nikoli autentizace. U cookies napříč originy je navíc nutné správně nastavit odesílání přihlašovacích údajů (`credentials`), konkrétní povolený origin, cookie atributy a CSRF. Nepovolujte libovolný origin s přihlašovacími údaji.

Bearer token se hodí pro mobilního klienta nebo volání služby. Při ověřování JWT kontrolujte podpis důvěryhodným klíčem, pevně povolené algoritmy, vydavatele (`iss`), příjemce (`aud`), expiraci (`exp`) a případné `nbf`. Povinné očekávané údaje vyžadujte i tehdy, když knihovna jinak kontroluje jen přítomná tvrzení. Pouhé dekódování payloadu nestačí. Krátká expirace omezuje dobu zneužití, neřeší však sama revokaci. Refresh tokeny potřebují bezpečné uložení, rotaci a možnost odvolání. Token v `localStorage` může ukrást XSS, tedy spuštění útočného skriptu v důvěryhodné stránce; token uložený v automaticky posílané cookie opět vyžaduje CSRF ochranu.

**OAuth 2.0** řeší delegování přístupu: aplikace získá oprávnění volat zdroj. **OpenID Connect (OIDC)** nad OAuth přidává ověření identity a ID token. Access token slouží API, ID token klientovi jako doklad přihlášení; nezaměňujte je. Pro přihlášení přes poskytovatele použijte udržovaného OIDC klienta a dokumentovaný tok Authorization Code s PKCE (Proof Key for Code Exchange): dočasný ověřovací řetězec a jeho odvozená výzva svážou výměnu autorizačního kódu s klientem, který přihlášení zahájil. OAuth samotný není přihlašovací protokol.

## 4. Časté chyby :id=_4-common-mistakes

- **Autentizace bez autorizace.** Oprávnění ověřujte u každé citlivé operace i nad konkrétním záznamem, ne pouze při zobrazení tlačítka.
- **Tajný klíč v repozitáři nebo token v URL.** Tajemství patří do zabezpečené konfigurace; URL se objevují v historii a přístupových logách.
- **Odhlášení přes GET.** Změna stavu patří do chráněného POST, nikoli do odkazu, který může prohlížeč přednačíst.
- **Bezpečnost odvozená jen z formátu.** Podepsaný JWT i session cookie lze ukrást; rozhodují přenos, uložení, ověření a životní cyklus.

<details>
<summary>Volitelné podrobnosti: obnova hesla a změny oprávnění</summary>

Reset hesla vyžaduje krátkodobý jednorázový odkaz a bezpečné doručení; chyby nemají prozrazovat existenci účtu. Při změně hesla či role zvažte ukončení ostatních session. Pokud role žije v dlouho platném tokenu, změna v databázi ji sama neaktualizuje. Provozní řešení zahrnuje také audit bez hesel a tokenů, omezení pokusů, správu klíčů a opravy závislostí.

</details>

## Související témata

- [Flask](Flask.md) — požadavky a odpovědi malé aplikace.
- [Middleware a routing](Middleware_a_routing.md) — společné zpracování a kontext.
- [WebSockets](WebSockets.md) — kontrola originu a dlouho žijící spojení.



