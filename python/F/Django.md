# Django

Django propojuje webové požadavky, formuláře, databázi a správu uživatelů. Na malém zápisníku si ukážeme celý průchod: prohlížeč odešle formulář, aplikace uloží poznámku do SQLite a JSON rozhraní ji vrátí.

## 1. Princip :id=_1-concept

**Projekt** obsahuje nastavení celého webu; **aplikace** (*app*) sdružuje konkrétní oblast, například poznámky. Jeden projekt může zapojit více aplikací. `manage.py` spouští příkazy se správným nastavením projektu. `settings.py` určuje mimo jiné připojené aplikace, databázi a middleware — společné zpracování před a po obsluze požadavku.

Požadavek prochází middlewarem, **URLconf** vybere podle cesty funkci zvanou **view** a ta vrátí odpověď. View může načíst data, vykreslit HTML šablonu nebo vrátit JSON, textový formát dat. U formuláře používáme GET k zobrazení a POST k uložení. Stav 200 znamená úspěšnou odpověď, 302 přesměrování a 404 nenalezený zdroj; více vysvětluje [REST API](REST_API.md).

**Cookie** je malý údaj, který prohlížeč uchová a posílá serveru podle pravidel platnosti. Django ji může použít pro identifikátor **session**, tedy stavu uchovaného mezi požadavky například pro přihlášení. Samotná návštěva stránky uživatele nepřihlásí.

**Model** je Python třída popisující ukládaná data. ORM (*object-relational mapping*) převádí operace s modely na SQL dotazy. **Migrace** je verzovaný popis změny databázového schématu: `makemigrations` vytvoří soubor s plánem a `migrate` jej provede. SQLite ukládá databázi do jednoho místního souboru, takže začátek nevyžaduje samostatný databázový server.

Django nabízí WSGI pro synchronní obsluhu i ASGI pro asynchronní provoz. Jde o rozhraní mezi Python aplikací a serverem; ASGI umí pracovat s asynchronními událostmi a dlouhými spojeními. Samotná volba ASGI nezmění blokující databázový kód na neblokující. Tento příklad má běžné synchronní views.

## 2. Příklad :id=_2-example

**Vícesouborový příklad:** začněte v novém prázdném adresáři, nikoli v existujícím Django projektu. Použijte Python 3.12 nebo novější podporovaný danou řadou. Volíme Django **5.2 LTS**, dlouhodobě podporovanou řadu, a její dostupné opravné verze. Pro jinou řadu ověřte [podporované interpretery](https://docs.djangoproject.com/en/5.2/faq/install/#what-python-version-can-i-use-with-django).

Windows PowerShell:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install "Django>=5.2,<5.3"
.\.venv\Scripts\python.exe -m django startproject config .
.\.venv\Scripts\python.exe manage.py startapp notes
```

macOS/Linux:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install 'Django>=5.2,<5.3'
.venv/bin/python -m django startproject config .
.venv/bin/python manage.py startapp notes
```

Vybraný interpret musí splňovat uvedené minimum. Generátor vytvoří `manage.py`, balíček `config` a aplikaci `notes`. Zachovejte vygenerované soubory; důležité výsledné cesty budou:

```text
projekt/
├── .venv/
├── manage.py
├── config/
│   ├── settings.py
│   ├── urls.py
│   ├── asgi.py
│   └── wsgi.py
└── notes/
    ├── migrations/
    ├── models.py
    ├── forms.py
    ├── views.py
    ├── urls.py
    ├── admin.py
    └── templates/notes/index.html
```

### Zapojení aplikace a modelu

V `config/settings.py` přidejte na konec seznamu `INSTALLED_APPS` položku `"notes.apps.NotesConfig"`. Ostatní vygenerované nastavení ponechte, zejména `CsrfViewMiddleware`, session middleware, `APP_DIRS=True` u šablon a výchozí SQLite databázi. Pro české popisky změňte `LANGUAGE_CODE = "cs"`. Vygenerovaný `SECRET_KEY` a `DEBUG=True` patří pouze tomuto místnímu projektu; nasazení vyžaduje vlastní tajný klíč mimo zdrojový kód a `DEBUG=False`.

Celý obsah `notes/models.py`:

```python
from django.db import models


class Note(models.Model):
    title = models.CharField("Název", max_length=80)

    def __str__(self):
        return self.title
```

`Note` dědí z `models.Model`; princip třídy a instance vysvětlují [Třídy a objekty](../B/Tridy_a_objekty.md). Django doplní číselný primární klíč `id`, který jednoznačně označuje řádek. Vytvořte celý `notes/forms.py`:

```python
from django import forms
from .models import Note


class NoteForm(forms.ModelForm):
    class Meta:
        model = Note
        fields = ["title"]
```

`ModelForm` sestaví formulář z vybraných polí modelu. Při `is_valid()` ověří povinnou hodnotu a délku; text ořízne o krajní mezery. Teprve potom smíme zavolat `form.save()`. Samotné `Model.save()` totiž plnou formulářovou validaci neprovádí.

### Views a cesty

Celý obsah `notes/views.py`:

```python
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_GET, require_http_methods
from .forms import NoteForm
from .models import Note


@require_http_methods(["GET", "POST"])
def index(request):
    form = NoteForm(request.POST if request.method == "POST" else None)
    if request.method == "POST" and form.is_valid():
        form.save()
        return redirect("notes:index")
    return render(
        request,
        "notes/index.html",
        {"form": form, "notes": Note.objects.order_by("id")[:20]},
        status=400 if request.method == "POST" else 200,
    )


@require_GET
def note_list(request):
    rows = list(Note.objects.order_by("id").values("id", "title")[:20])
    return JsonResponse({"items": rows})


@require_GET
def note_detail(request, note_id: int):
    note = get_object_or_404(Note, pk=note_id)
    return JsonResponse({"id": note.id, "title": note.title})
```

Vytvořte celý `notes/urls.py`:

```python
from django.urls import path
from . import views

app_name = "notes"
urlpatterns = [
    path("", views.index, name="index"),
    path("api/notes/", views.note_list, name="list"),
    path("api/notes/<int:note_id>/", views.note_detail, name="detail"),
]
```

Převodník `<int:note_id>` vybírá celočíselnou část cesty. Jména rout dovolují přesměrovat pomocí `notes:index`, aniž by view natvrdo opisovala URL. Celý obsah `config/urls.py`:

```python
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("notes.urls")),
]
```

`include` předá zbývající cestu URLconf aplikace. Správu poznámek zapojte celým obsahem `notes/admin.py`:

```python
from django.contrib import admin
from .models import Note

admin.site.register(Note)
```

### Šablona a migrace

Vytvořte adresáře `notes/templates/notes` a soubor `index.html` s celým obsahem:

```html
<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Poznámky</title>
</head>
<body>
  <h1>Poznámky</h1>
  <form method="post">
    {% csrf_token %}
    {{ form.as_p }}
    <button type="submit">Uložit</button>
  </form>
  <ul>
    {% for note in notes %}
      <li>{{ note.id }}: {{ note.title }}</li>
    {% empty %}
      <li>Zatím bez poznámek.</li>
    {% endfor %}
  </ul>
</body>
</html>
```

Šablona vloží formulář a nejvýše prvních 20 poznámek. Proměnné v běžném HTML textu automaticky escapuje, takže název není interpretován jako HTML. `{% csrf_token %}` vloží skrytý ochranný token. **CSRF** je podvržení akce cizí stránkou, při němž prohlížeč může automaticky přiložit přihlašovací cookies. Django při POST vyžaduje odpovídající token a provádí další kontroly; ochranu kvůli pohodlnému volání API nevypínejte.

V kořeni tohoto nového projektu spusťte na Windows:

```powershell
.\.venv\Scripts\python.exe manage.py makemigrations notes
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000 --noreload
```

Na macOS/Linux použijte stejné argumenty s `.venv/bin/python`:

```bash
.venv/bin/python manage.py makemigrations notes
.venv/bin/python manage.py migrate
.venv/bin/python manage.py runserver 127.0.0.1:8000 --noreload
```

Vznikne migrace `notes/migrations/0001_initial.py` a místní `db.sqlite3`; migrace připraví také vestavěné tabulky uživatelů a sessions. **Spouštějte je pouze v tomto cvičném projektu.** Databázi existující aplikace může migrace změnit a vyžaduje vlastní plán i zálohu. Server ponechte v terminálu, zastavuje se Ctrl+C. `runserver` je vývojový server, ne server pro veřejné nasazení.

### Viditelný průchod aplikací

1. Otevřete `http://127.0.0.1:8000/`: stav **200**, formulář a „Zatím bez poznámek.“.
2. Zadejte `První poznámka` a zvolte **Uložit**. POST vrátí **302** s `Location: /`; prohlížeč provede nový GET **200** a zobrazí `1: První poznámka`. Přesměrování po uložení omezuje opětovné odeslání při obnovení stránky.
3. Otevřete `http://127.0.0.1:8000/api/notes/`: **200**, tělo `{"items": [{"id": 1, "title": "První poznámka"}]}`. Detail `/api/notes/1/` vrátí **200** a `{"id": 1, "title": "První poznámka"}`. Obě odpovědi mají `Content-Type: application/json`.
4. Detail `/api/notes/999/` bez odpovídajícího záznamu vrátí **404**. V tomto projektu jde o HTML chybovou stránku Django; není to JSON kontrakt pro všechny chyby API.
5. Odešlete název tvořený jen mezerami: server vrátí **400** s formulářovou chybou a žádný řádek nepřidá. Prohlížeč navíc běžně brání prázdnému povinnému poli ještě před odesláním.

Číslo 1 předpokládá novou databázi a první úspěšné uložení. Údaje přetrvají restart serveru. Seznam je omezený na 20 záznamů, nejde o úplnou implementaci stránkování.

Pro kontrolu JSON stačí v PowerShellu `curl.exe -i http://127.0.0.1:8000/api/notes/`, na macOS/Linux `curl -i http://127.0.0.1:8000/api/notes/`. Ruční POST bez CSRF tokenu odmítne middleware stavem **403** ještě před view. Pro první zápis proto používáme dodaný formulář.

## 3. Kdy použít :id=_3-when-to-use

Django se hodí pro databázový web s formuláři, uživateli a administrací. Vestavěné součásti poskytují společné konvence, ale je potřeba rozumět jejich zapojení. Pro malou službu bez databáze může být [Flask](Flask.md) jednodušší; pro typované JSON API nabízí [FastAPI](FastAPI.md) jiný výchozí základ.

## 4. Časté chyby :id=_4-common-mistakes

- **Změna modelu bez migrace.** Python třída a schéma databáze se mohou rozejít. Vytvořte migraci, přečtěte její plán a aplikujte ji na správnou databázi.
- **Spoléhání na ORM jako jedinou validaci.** ORM bezpečně váže běžné hodnoty dotazů, ale nehlídá za vás oprávnění a všechny obchodní podmínky. Surové SQL sestavené z uživatelských řetězců tuto ochranu obchází.
- **Vypnutí CSRF nebo automatického escapování.** Ponechte middleware i token. Filtr `safe` pro nedůvěryhodný text může otevřít cestu ke spuštění cizího skriptu.
- **Záměna ochrany CSRF za přihlášení.** Zápisník je místní veřejná ukázka, nemá řízení přístupu. CSRF neurčuje, kdo smí číst nebo měnit data; to řeší autentizace a autorizace.

<details>
<summary>Volitelné podrobnosti: admin a vestavěná autentizace</summary>

V druhém terminálu vytvořte místního správce příkazem Windows `.\.venv\Scripts\python.exe manage.py createsuperuser`, macOS/Linux `.venv/bin/python manage.py createsuperuser`. Heslo zadejte interaktivně, ne do zdrojového kódu. Na `http://127.0.0.1:8000/admin/` se přihlaste a otevřete model Note; administrace může poznámky vytvářet, měnit a mazat. Používá vestavěné přihlášení, hashování hesel, session a oprávnění. Samotná registrace modelu nepřidá ochranu našim veřejným views.

Session je stav přihlášení svázaný s cookie prohlížeče. Django nabízí `login_required` a kontroly oprávnění; ochranu je nutné přidat na relevantní cesty. Rozdíl mezi ověřením identity, kontrolou oprávnění, cookies a tokeny rozvádí [Autentizace](Authentication.md). Před nasazením nastavte HTTPS, zabezpečené cookies, povolené hostitele, tajné hodnoty a statické soubory; použijte také `manage.py check --deploy` nad produkční konfigurací.

</details>

## Související témata

- [Třídy a objekty](../B/Tridy_a_objekty.md) — instance modelu a dědičnost.
- [REST API](REST_API.md) — stavové kódy, stránkování a konzistentní chyby.
- [Middleware a routing](Middleware_a_routing.md) — pořadí zpracování požadavku.
- [Autentizace](Authentication.md) — identity a oprávnění.
