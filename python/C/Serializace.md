# Serializace

Serializace převádí data do podoby pro uložení nebo přenos; deserializace je načítá zpět. Zvolený formát určuje, jaké informace lze zachovat a co musí aplikace ověřit.

## Princip :id=_1-concept

JSON je textový formát pro objekty se textovými klíči, pole, řetězce, čísla, booleany a `null`. `json.dumps()` vrací `str`, `loads()` text parsuje; `dump()` a `load()` pracují s otevřeným proudem. `ensure_ascii=False` zachová diakritiku ve výsledném textu místo escape sekvencí; význam dat se tím nemění.

Parsování neověřuje aplikační pravidla rozhraní. Platný JSON může být seznam, číslo nebo slovník s chybnými hodnotami. Na hranici aplikace kontrolujte tvar, verzi, povinná pole a jejich rozsahy. Omezte velikost přijímaných dat před parsováním; JSON automaticky nechrání před vyčerpáním paměti či času procesoru.

## Příklady :id=_2-example

**Samostatný příklad:** nejprve převod do textu a zpět.

```python
import json

data = {"name": "Kája", "score": 42, "active": True}
text = json.dumps(data, ensure_ascii=False)
print(text)
print(json.loads(text)["active"])
print(json.loads(json.dumps((10, 20))))
```

Výstup:

```text
{"name": "Kája", "score": 42, "active": true}
True
[10, 20]
```

JSON používá `true`, Python `True`. N-tice se převede na JSON pole a načte jako seznam.


**Samostatný příklad:** malé výslovně definované schéma verze 1. Neznámá pole se zde odmítají; jiná veřejná rozhraní mohou záměrně dovolit rozšíření. `bool` je podtyp `int`, proto pro celočíselné pole používáme přesný test typu, aby `True` nebylo skóre ani číslo verze.

```python
import json
from pathlib import Path
from tempfile import TemporaryDirectory

def validate_state(value: object) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != {"version", "name", "score", "active"}:
        raise ValueError("Neočekávaná pole stavu")
    if type(value["version"]) is not int or value["version"] != 1:
        raise ValueError("Nepodporovaná verze")
    if not isinstance(value["name"], str) or not value["name"].strip():
        raise ValueError("Jméno musí být neprázdný text")
    if type(value["score"]) is not int or value["score"] < 0:
        raise ValueError("Skóre musí být nezáporné celé číslo")
    if type(value["active"]) is not bool:
        raise ValueError("active musí být boolean")
    return value

payload = {"version": 1, "name": "Kája", "score": 42, "active": True}
with TemporaryDirectory(prefix="python-json-") as directory:
    path = Path(directory) / "state.json"
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(payload, stream, ensure_ascii=False, indent=2, allow_nan=False)
    with path.open("r", encoding="utf-8") as stream:
        restored = validate_state(json.load(stream))

    print(f"{restored['name']}: {restored['score']}")

for raw in ('{"name":', '[]', '{"version": 1}'):
    try:
        validate_state(json.loads(raw))
    except json.JSONDecodeError:
        print("Chyba syntaxe JSON")
    except ValueError as error:
        print(f"Chyba schématu: {error}")
```

Výstup:

```text
Kája: 42
Chyba syntaxe JSON
Chyba schématu: Neočekávaná pole stavu
Chyba schématu: Neočekávaná pole stavu
```

Výstup je `Kája: 42`, `Chyba syntaxe JSON` a dvakrát `Chyba schématu: Neočekávaná pole stavu`. `JSONDecodeError` popisuje chybu syntaxe a dědí z `ValueError`; vlastní ValueError zde znamená nevyhovující schéma. Při zobrazení chyby uživateli nemusíte vypisovat celý vstup, který může obsahovat citlivá data.

## Kdy použít JSON a kdy jiný formát :id=_3-when-to-use

JSON se hodí pro konfiguraci, jednoduché exporty a API (programová rozhraní), pokud definujete schéma. Nemá vlastní typ `datetime`, `Decimal`, množinu ani libovolnou Python třídu. Pro čas stanovte konkrétní textový formát s posunem, pro peníze vhodnou přesnou reprezentaci. Automatické `default=str` sice odstraní některé chyby serializace, ale může skrýt ztrátu typu a vytvořit nestabilní formát.

`pickle` umí rekonstruovat více Python objektů, ale při načítání může spustit kód. **Nenačítejte pickle od uživatele, ze sítě ani ze souboru, jehož důvěryhodnost není zaručená.** Ani název nebo přípona souboru důvěru nevytvářejí. Pickle není jazykově nezávislý veřejný protokol a změny tříd mohou narušit dlouhodobou kompatibilitu.

## Časté chyby :id=_4-common-mistakes

Převod tam a zpět (round-trip) nemusí zachovat původní Python typy: tuple se načte jako list a celočíselný klíč objektu jako řetězec. JSON číslo není zárukou stejné přesnosti ve všech jazycích. Python navíc ve výchozím nastavení dovoluje nestandardní NaN a Infinity; `allow_nan=False` zpřísní zápis, samo však nezpřísní dekodér. Pro přísné načítání lze odmítnout tyto konstanty přes `parse_constant`.

Duplicitní jména v JSON objektu výchozí dekodér sloučí s ponecháním poslední hodnoty. Pokud je musíte odmítat, řešte je při parsování pomocí `object_pairs_hook`; po vytvoření dict už duplicity nepoznáte. Opakované `dump()` za sebe do jednoho souboru nevytvoří jeden platný JSON dokument. Pro proud záznamů zvolte popsané rámování, například JSON Lines s jedním dokumentem na řádek.

<details>
<summary>Volitelné podrobnosti: důvěryhodný pickle a verze schématu</summary>

**Samostatný příklad:** pouze převod tam a zpět u dat vytvořených v témže procesu; neukládá ani nenačítá cizí soubor.

```python
import pickle

original = {"coordinates": (10, 20)}
blob = pickle.dumps(original, protocol=5)
restored = pickle.loads(blob)  # Načítáme pouze vlastní data vytvořená o řádek výše.
print(restored)
```

Výstup:

```text
{'coordinates': (10, 20)}
```

Ve veřejném schématu popište význam polí, výchozí hodnoty, možnost `null`, maximální velikost a postup migrace. Číslo verze je jen začátek; samo nemigruje data ani neřeší kompatibilitu starého čtenáře.

</details>

## Související témata

- [Datum a čas](Datum_a_cas.md) — ISO 8601 a časové pásmo.
- [HTTP a síťová komunikace](Networking.md) — validace odpovědi a limit těla.
- [Práce se soubory](../B/Prace_se_soubory.md) — kódování a životnost proudu.
