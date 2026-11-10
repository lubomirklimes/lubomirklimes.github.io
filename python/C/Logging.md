<span id="logging"></span>

# Logování

Logování zaznamenává události s úrovní, původem a potřebným kontextem. `print()` se stále hodí pro vlastní výstup CLI, zatímco diagnostika má umožnit filtrování a směrování.

## Princip :id=_1-concept

Pojmenovaný logger, obvykle `logging.getLogger(__name__)`, reprezentuje zdroj zpráv. V importovaném modulu `__name__` obsahuje jeho jméno; v přímo spuštěném souboru je `__main__`. Logger vytváří `LogRecord`, handler jej doručuje do cíle a formatter převádí na výsledný text. Nastavení patří vstupnímu bodu aplikace, ne každé knihovně zvlášť.

Úrovně od nejnižší jsou DEBUG pro podrobnosti, INFO pro běžné události, WARNING pro problém bez okamžitého selhání, ERROR pro neúspěšnou operaci a CRITICAL pro mimořádně závažnou chybu. Úroveň sama proces neukončí ani nezmění návratový kód. Filtrují loggery i handlery; zpráva musí projít oběma příslušnými prahy.

## Příklady :id=_2-example

**Samostatný příklad:** konfigurace jednou na hranici samostatného programu. Log jde na standardní chybový výstup (`stderr`), běžný `print()` na standardní výstup (`stdout`). DEBUG je pod zvolenou úrovní INFO; `exception()` přidá traceback, tedy zásobník volání a typ chyby.

```python
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("demo.worker")
logger.debug("Podrobnosti pro vývoj")
logger.info("Zpracováno položek: %d", 3)
try:
    int("neplatné číslo")
except ValueError:
    logger.exception("Převod vstupu selhal")
```

Na stderr se objeví následující záznamy; prostřední část tracebacku je zkrácena, protože cesta a číslo řádku závisí na umístění souboru:

```text
INFO demo.worker: Zpracováno položek: 3
ERROR demo.worker: Převod vstupu selhal
Traceback (most recent call last):
  … řádek s int("neplatné číslo") …
ValueError: invalid literal for int() with base 10: 'neplatné číslo'
```

Stdout zůstane prázdný. Samotný log zde nekopíruje nedůvěryhodný vstup do vlastní zprávy, ale traceback může obsahovat text původní výjimky. I informace o výjimkách proto podléhají pravidlům ochrany dat. Čísla řádků v tracebacku závisí na umístění souboru.

Formátovací argumenty jako `%d` se do zprávy vloží až při formátování. **Výrazy předané jako argumenty se ale vyhodnotí před voláním loggeru.** Pro drahý výpočet ověřte `logger.isEnabledFor(logging.DEBUG)` ještě před jeho provedením; samotné nahrazení f-řetězce parametry výpočet neodloží.

**Samostatný příklad:** skutečný JSON záznam vytváří formatter přes `json.dumps()`. Samotný řetězec s dvojtečkami nebo `extra=` JSON nevytvoří. `extra` dodává pole do LogRecord; formatter je musí výslovně použít.

```python
import json
import logging

class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", None),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)

logger = logging.getLogger("demo.json")
logger.setLevel(logging.INFO)
logger.propagate = False  # Záznam doručí pouze náš handler, bez další kopie u předků.
handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
logger.addHandler(handler)
try:
    logger.info("Dokončeno", extra={"request_id": "demo-1"})
finally:
    logger.removeHandler(handler)
    handler.close()
```

Výstup na stderr:

```text
{"level": "INFO", "logger": "demo.json", "message": "Dokončeno", "request_id": "demo-1"}
```

`JsonFormatter` dědí z `logging.Formatter` a přepisuje metodu `format`. `self` označuje danou instanci formatteru; viz [Třídy a objekty](../B/Tridy_a_objekty.md). Zde používáme malý JSON formát bez času. Pro reálné použití dohodněte schéma, časový formát, korelační pole a maximální velikost.

## Konfigurace a použití :id=_3-when-to-use

`basicConfig()` běžně nic nezmění, pokud root už má handler. V notebooku, nástroji spouštějícím testy nebo hostované aplikaci proto nepředpokládejte čistý stav z prvního příkladu. `force=True` (od 3.8) odstraní a zavře existující root handlery; použijte jej jen tam, kde aplikace skutečně vlastní celé nastavení. Knihovna nemá přenastavovat hostitele.

Jména loggerů tvoří hierarchii, například `app` a `app.worker`. Při `propagate=True` se záznam předává handlerům předků. Úrovně nadřazených loggerů se už nekontrolují, úrovně jejich handlerů ano. Pokud stejný výstupní handler přidáte potomkovi i root loggeru, zpráva může být zapsána dvakrát. Konfigurujte jednou, případně záměrně vypněte propagaci u samostatného cíle.

## Časté chyby :id=_4-common-mistakes

`logger.exception()` přidává aktuální výjimku a patří do její obsluhy. Mimo `except` použijte obyčejnou úroveň nebo předejte potřebné exception informace výslovně. Odeslání zprávy úrovně ERROR samo neznamená, že program musí skončit; rozhodnutí patří logice aplikace.

Nepřidávejte handler při každém volání pomocné funkce. `extra` nesmí přepsat rezervovaná pole, například `message` či `name`, a formatter nesmí bez náhrady vyžadovat vlastní pole u všech cizích loggerů. Nepřidávejte do logů hesla, tokeny, celé requesty ani bez rozmyslu text výjimek. Diagnostický log sám nezajišťuje neměnnou auditní stopu, retenci ani kontrolu přístupu.

<details>
<summary>Volitelné podrobnosti: soubory a provozní nastavení</summary>

Pro souborový handler určete UTF-8 a politiku rotace, například `RotatingFileHandler`; omezte objem a nastavte oprávnění cíle. Rotace běžným handlerem není obecné řešení souběžného zápisu více procesů do stejného souboru. Pro pomalý cíl lze oddělit doručování přes `QueueHandler` a `QueueListener`, včetně jejich úklidu při ukončení.

`dictConfig()` umožňuje centrální konfiguraci; parametr `disable_existing_loggers` má výchozí hodnotu True a může nečekaně umlčet již existující loggery. Konfigurace také může vytvářet objekty přes importované cesty, proto ji nepovažujte za libovolná nedůvěryhodná uživatelská data. Pro čas v UTC určete konverzi formatteru místo pouhého připsání písmene Z k lokálním hodinám.

</details>

## Související témata

- [Datum a čas](Datum_a_cas.md) — UTC a trvání operace.
- [Práce s procesy](Prace_s_procesy.md) — stderr a návratové kódy.
- [CLI aplikace](CLI_aplikace.md) — výstup pro uživatele vs diagnostika.
