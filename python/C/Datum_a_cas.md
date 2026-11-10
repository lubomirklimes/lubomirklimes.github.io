# Datum a čas

`datetime` reprezentuje kalendářní údaje a časové okamžiky, `time.perf_counter()` měří trvání běhu. Tyto úlohy vyžadují odlišné hodiny.

UTC je koordinovaný světový čas, společný základ pro ukládání okamžiků. Databáze IANA obsahuje pojmenovaná pásma, například `Europe/Prague`, a jejich pravidla. ISO 8601 je standard zápisu data a času, například `2026-04-26T10:30:00+00:00`.

`zoneinfo` potřebuje data časových pásem. Na Windows do prostředí z [úvodu](../A/Uvod_do_Pythonu.md) nainstalujte `python -m pip install tzdata`; jiné systémy je obvykle poskytují samy.

## Princip :id=_1-concept

`date` označuje datum bez času, `timedelta` interval a `datetime` datum s časem. Hodnota je *aware* (s určeným časovým posunem), pokud má `tzinfo` a její `utcoffset()` není `None`; jinak je *naive* (bez určeného posunu) a sama neříká, v jakém pásmu se má vykládat. Pro aktuální okamžik v UTC použijte `datetime.now(timezone.utc)`. `datetime.utcnow()` vrací naive hodnotu a od 3.12 je zastaralé.

Pevný posun `+01:00` neurčuje pravidla časového pásma. `ZoneInfo("Europe/Prague")` poskytuje pravidla včetně změn letního času podle dostupné databáze. Převod známého okamžiku provádí `astimezone()`; `replace(tzinfo=...)` jen přiřadí interpretaci stejným číslům hodin. U naive hodnot neprovádějte `astimezone()` bez záměru: Python je může vyložit v místním pásmu počítače.

## Příklady :id=_2-example

**Samostatný příklad:** deterministický ISO 8601 vstup obsahuje posun a určuje okamžik. Výstup je `2026-04-26T10:30:00+00:00` a `900.0` sekund. ISO zápis s posunem nezachovává jméno IANA pásma.

```python
from datetime import datetime, timedelta, timezone
from time import perf_counter

start = datetime.fromisoformat("2026-04-26T10:30:00+00:00")
end = start + timedelta(minutes=15)

print(start.isoformat())
print((end - start).total_seconds())

clock = perf_counter()
total = sum(range(10000))
elapsed = perf_counter() - clock
print(f"Součet: {total}; trvalo {elapsed:.6f} s")
```

**Samostatný příklad:** při podzimním přechodu v Praze nastane `02:30` dvakrát. `fold=0` volí první výskyt, `fold=1` druhý. Na jaře naopak některé místní časy neexistují; konstruktor je sám neodmítne.

```python
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

prague = ZoneInfo("Europe/Prague")
first = datetime(2026, 10, 25, 2, 30, tzinfo=prague, fold=0)
second = first.replace(fold=1)

print(first.isoformat())
print(second.isoformat())

missing = datetime(2026, 3, 29, 2, 30, tzinfo=prague)
back = missing.astimezone(timezone.utc).astimezone(prague)
print("Návrat přes UTC:", back.isoformat())
print("Stejné místní hodiny:", back.replace(tzinfo=None) == missing.replace(tzinfo=None))
```

Výstup:

```text
2026-10-25T02:30:00+02:00
2026-10-25T02:30:00+01:00
Návrat přes UTC: 2026-03-29T03:30:00+02:00
Stejné místní hodiny: False
```

Výstup obsahuje `2026-10-25T02:30:00+02:00` a `2026-10-25T02:30:00+01:00`. Návrat přes UTC ukazuje, že jarní `02:30` neodpovídá platnému místnímu času. Při přijímání místního času porovnejte oba kandidáty (`fold=0` a `fold=1`) po převodu do UTC a zpět:

- Dva různé platné okamžiky: hodiny se opakují; nechte uživatele vybrat první nebo druhý výskyt.
- Žádný platný okamžik: hodiny se přeskočily; vstup odmítněte nebo dohodněte výslovné pravidlo posunu.
- Jeden jedinečný okamžik: běžný platný místní čas. Samotné `fold=1` není univerzální oprava chybějícího času.

Pokud databáze chybí, vznikne `ZoneInfoNotFoundError`. Nainstalujte `python -m pip install tzdata` do prostředí projektu. Příkaz musí použít interpreter tohoto prostředí; podrobnosti o venv jsou v [úvodu](../A/Uvod_do_Pythonu.md). Pravidla se mohou aktualizovat, proto pro důležité plánování evidujte i zdroj a verzi databáze.

Naměřené trvání se při každém běhu liší; první příklad vypíše součet `49995000` a skutečně naměřené sekundy, nikoli pevnou očekávanou hodnotu.

## Kdy zvolit UTC a kdy místní čas :id=_3-when-to-use

Pro uložený okamžik události používejte UTC a místní čas odvozujte pro zobrazení. Pro budoucí opakovaný termín, například každý den v 9 hodin v Praze, uchovejte i místní pravidlo a identifikátor pásma; pevný UTC interval nemusí odpovídat stejným místním hodinám.

Pro měření délky operace použijte `perf_counter()`, pro časový limit `time.monotonic()` (například konec čekání určete jako `time.monotonic() + 5`). Jde o monotónní hodiny, které nejsou ovlivněné změnou systémového kalendářního času. Jejich absolutní hodnotu neukládejte jako čas události. `time.sleep()` jen pozastavuje běh; neslibuje přesné probuzení v zadaném okamžiku.

## Časté chyby :id=_4-common-mistakes

Odečítání a uspořádání naive a aware datetime vyvolá TypeError; rovnost však obecně vrátí `False`, ne výjimku. Nemíchejte je v jednom rozhraní.

Při odečtení dvou datetime se **stejným objektem tzinfo** Python ignoruje posun a `fold`: u podzimní dvojice výše může vyjít nula, ačkoli okamžiky dělí hodina. Pro skutečně uplynulou dobu převeďte obě hodnoty do UTC. Přičtení kalendářního dne v místním pásmu zase nemusí znamenat přesně 24 uplynulých hodin.

<details>
<summary>Volitelné podrobnosti: výměnný formát a kalendář</summary>

`fromisoformat()` podporuje konkrétní varianty ISO 8601, nikoli libovolný uživatelský zápis. Úspěšné parsování samo nezaručuje povinný posun ani aplikační rozsah data; pravidla rozhraní ověřte zvlášť. `strftime()` je pro prezentaci, přičemž některé názvy a formátovací detaily závisí na locale a platformě.

Měsíc nemá pevný počet sekund ani dní, proto jej nelze obecně vyjádřit jednou konstantou `timedelta`. Pro datum splatnosti či konec měsíce určete kalendářní pravidlo.

</details>

## Související témata

- [Serializace](Serializace.md) — formát a validace časových údajů.
- [Logování](Logging.md) — čas události v diagnostice.
