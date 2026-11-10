<span id="výjimky-a-error-handling"></span>

# Výjimky a jejich zpracování

Výjimka přeruší běžný tok programu a předá informaci nejbližší odpovídající obsluze. Umožňuje oddělit úspěšný výsledek od chybového stavu, ale neodstraňuje potřebu navrhnout jasná pravidla rozhraní.

## Princip :id=_1-concept

Do `try` dejte operaci, jejíž selhání chcete ošetřit, a zachytávejte konkrétní očekávané typy. Výjimky se hledají od první odpovídající větve `except`; odvozený typ proto patří před obecnějšího předka. Neobsloužená výjimka postupuje do volajícího a může ukončit program s tracebackem, tedy výpisem zásobníku volání.

`else` se provede, pokud tělo `try` skončilo bez výjimky a bez předčasného opuštění pomocí `return`, `break` či `continue`. Umožňuje oddělit další práci, jejíž chyby nemá obsluhovat stejný `except`. `finally` provádí úklid při běžném opuštění konstrukce, včetně výjimky a `return`; není zárukou při násilném ukončení procesu. U souborů dejte přednost `with`.

Vlastní výjimka je třída odvozená od existující výjimky. `InvalidAgeError(ValueError)` proto zachytí i obsluha `ValueError`. Tělo může tvořit jen dokumentační řetězec; základy dědičnosti vysvětlují [třídy a objekty](Tridy_a_objekty.md).

## Příklady :id=_2-example

**Samostatný příklad:** převod chyby parsování na doménovou výjimku zachovává původní příčinu přes `from exc`. Vstup je v této funkci řetězec; `int()` přijme i okolní mezery a znaménko.

```python
class InvalidAgeError(ValueError):
    """Vstup nelze převést na nezáporné celé číslo."""

def parse_age(value: str) -> int:
    try:
        age = int(value)
    except ValueError as exc:
        raise InvalidAgeError("Věk musí být celé číslo") from exc
    if age < 0:
        raise InvalidAgeError("Věk nesmí být záporný")
    return age

for raw in ["22", "-5", "abc"]:
    try:
        age = parse_age(raw)
    except InvalidAgeError as err:
        print(f"Chyba vstupu: {err}")
    else:
        print(f"Platný věk: {age}")

try:
    parse_age("abc")
except InvalidAgeError as err:
    print(f"Příčina: {err.__cause__!r}")
```

Výstup:

```text
Platný věk: 22
Chyba vstupu: Věk nesmí být záporný
Chyba vstupu: Věk musí být celé číslo
Příčina: ValueError("invalid literal for int() with base 10: 'abc'")
```

Výpis ukazuje platný věk, dva chybné vstupy a původní příčinu chyby převodu. Záporné číslo vyvolá vlastní chybu přímo, ne jako důsledek selhání `int()`.

**Samostatný příklad:** `else` odděluje úspěch od převodu, `finally` proběhne v obou větvích. Výstup je `['číslo: 7', 'úklid', 'chybný vstup', 'úklid']`.

```python
events = []
for raw in ("7", "chyba"):
    try:
        number = int(raw)
    except ValueError:
        events.append("chybný vstup")
    else:
        events.append(f"číslo: {number}")
    finally:
        events.append("úklid")

print(events)
```

Výstup:

```text
['číslo: 7', 'úklid', 'chybný vstup', 'úklid']
```

## Kdy zachytit a kdy předat dál :id=_3-when-to-use

Zachyťte chybu tam, kde umíte rozhodnout o opravě, náhradě výsledku nebo srozumitelné odpovědi uživateli. Pomocná funkce obvykle nemá současně vypisovat chybu a vracet úspěšně vypadající hodnotu. Vlastní výjimka dává smysl, pokud volající potřebuje rozlišit doménový problém od detailu implementace.

Při obohacení chyby použijte `raise NewError(...) from exc`; uvnitř obsluhy samotné `raise` znovu vyvolá aktuální výjimku. Návrat `None` je také legitimní volba, pokud jasně znamená očekávanou nepřítomnost výsledku, například neúspěšné hledání, a nezaměňuje ji se selháním operace.

## Časté chyby :id=_4-common-mistakes

Prázdné `except:` zachytí i `KeyboardInterrupt` a `SystemExit`, které dědí z `BaseException`. `except Exception` je nezachytí, ale stále zahrnuje mnoho programátorských chyb. Široké zachycení může být vhodné na hranici aplikace pro zaznamenání a další předání; v běžné pomocné funkci často schová závadu.

Nepoužívejte `return` ve `finally`: může přepsat návratovou hodnotu i potlačit výjimku. `assert` slouží pro vývojové předpoklady a testy; v optimalizovaném běhu může být odstraněn. Pro validaci uživatelských dat použijte explicitní podmínku a výjimku.

<details>
<summary>Volitelné podrobnosti: příčina a kontext</summary>

Při vzniku nové výjimky během obsluhy Python automaticky uchová kontext v `__context__`. `raise ... from exc` navíc explicitně nastaví `__cause__` a traceback ukáže přímou příčinu. `from None` potlačí zobrazení implicitního kontextu, ale neodstraní jej z objektu výjimky. Používejte jej jen při záměrném zjednodušení veřejného rozhraní; pro diagnostiku bývá příčina užitečná.

Zalogování na každé vrstvě vytváří duplicity. Zvolte vrstvu odpovědnou za záznam a nepřidávejte do zpráv nepotřebná citlivá vstupní data. Chyby úklidu mohou překrýt původní selhání; i úklid má mít srozumitelná pravidla.

</details>

## Související témata

- [Moduly a balíčky](Moduly_a_balicky.md) — oddělení veřejného rozhraní.
- [Práce se soubory](Prace_se_soubory.md) — `OSError`, dekódování a uzavření prostředků.
