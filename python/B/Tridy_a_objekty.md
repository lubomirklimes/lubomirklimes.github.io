# Třídy a objekty

Objekt spojuje data a operace nad nimi. Seznam i řetězec už jsou objekty: `items.append()` je volání metody seznamu. **Třída** popisuje, jaké údaje a chování mají její jednotlivé objekty neboli instance. Vlastní třída se hodí, pokud stav používá několik souvisejících operací.

## Princip :id=_1-concept

`class` definuje třídu. Volání `Counter("Dveře")` vytvoří instanci; Python zavolá její inicializační metodu `__init__`. Parametr `self` označuje právě tuto instanci a při volání metody se předává automaticky. Jméno je konvence, nikoli klíčové slovo; dodržujte ji. `self.value` je atribut uložený v konkrétním objektu.

## Příklad :id=_2-example

**Samostatný příklad:** dvě počítadla mají nezávislý stav.

```python
class Counter:
    def __init__(self, name):
        self.name = name
        self._value = 0

    def increment(self):
        self._value += 1

    @property
    def value(self):
        return self._value

doors = Counter("Dveře")
windows = Counter("Okna")
doors.increment()
doors.increment()
print(doors.name, doors.value)
print(windows.name, windows.value)
```

Výstup:

```text
Dveře 2
Okna 0
```

Metoda je funkce definovaná ve třídě. Volání `doors.increment()` předá `doors` do `self`. `@property` dovolí číst vypočítanou nebo chráněnou hodnotu jako atribut (`doors.value` bez závorek); bez setteru nelze přiřadit `doors.value = 10`. Jedno podtržítko u `_value` znamená „interní detail“. Přímému přístupu nebrání, proto uživatelé třídy mají používat veřejné metody a vlastnosti.

### Dědičnost a super()

Odvozená třída převezme chování předka a může je rozšířit. `super()` umožní zavolat odpovídající metodu předka, například jeho inicializaci. **Samostatný příklad:**

```python
class Greeting:
    def __init__(self, name):
        self.name = name

    def message(self):
        return f"Ahoj, {self.name}"

class FormalGreeting(Greeting):
    def __init__(self, name, title):
        super().__init__(name)
        self.title = title

    def message(self):
        return f"Dobrý den, {self.title} {self.name}"

print(Greeting("Eva").message())
print(FormalGreeting("Nováková", "paní").message())
```

Výstup:

```text
Ahoj, Eva
Dobrý den, paní Nováková
```

`FormalGreeting` přepisuje metodu `message`. Příbuznost tříd má vyjadřovat společné chování, nikoli jen ušetřit několik řádků. Vlastní výjimky také dědí z tříd standardních výjimek; viz [výjimky](Vyjimky_a_error_handling.md).

## Kdy použít :id=_3-when-to-use

- Funkce stačí pro výpočet z argumentů bez uchovávaného stavu.
- Slovník stačí pro jednoduchý záznam dat, například načtený JSON.
- Třídu zvolte, když stav mění několik souvisejících metod nebo potřebujete hlídat jeho pravidla.
- Pro třídu převážně uchovávající data může `dataclasses.dataclass` ze standardní knihovny doplnit například `__init__`; nejprve se naučte, co tento kód dělá ručně.

## Časté chyby :id=_4-common-mistakes

**Sdílený měnitelný atribut třídy:** `items = []` přímo v těle třídy vytvoří společný seznam. Má-li mít každá instance vlastní seznam, vytvořte `self.items = []` v `__init__`. **Samostatný příklad správného řešení:**

```python
class Basket:
    def __init__(self):
        self.items = []

first = Basket()
second = Basket()
first.items.append("jablko")
print(first.items)
print(second.items)
```

Výstup:

```text
['jablko']
[]
```

V definici běžné metody nezapomeňte `self`; při volání ho Python dodá i tehdy, když jste pro něj parametr nezapsali, a vznikne `TypeError`. `__value` se dvěma podtržítky mění interní jméno atributu kvůli kolizím v dědičnosti, ale nevytváří bezpečnostní ochranu ani skutečné tajemství. Jména jako `__init__` s podtržítky na obou koncích jsou zvláštní metody Pythonu; nevymýšlejte pro své metody taková jména.

## Související témata

- [Pokročilé funkce](Pokrocile_funkce.md) — dekorátory a uzávěry.
- [Typování v Pythonu](Typovani_v_Pythonu.md) — anotace a TypedDict.
- [Výjimky a jejich zpracování](Vyjimky_a_error_handling.md) — odvozené třídy výjimek.
