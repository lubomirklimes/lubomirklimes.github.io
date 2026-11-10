# Úvod do Pythonu

Python je programovací jazyk pro skripty, automatizaci, web i práci s daty. Průvodce předpokládá **Python 3.12 nebo novější**. U externích knihoven vždy zkontrolujte podporované verze.

## 1. Princip :id=_1-concept

Jazyk určuje pravidla zápisu. **Interpret** je program, který váš kód spouští. Běžná implementace se jmenuje **CPython**; stejný Python používáte na Windows, macOS i Linuxu.

### Instalace a první spuštění

- **Windows:** z [python.org](https://www.python.org/downloads/) nainstalujte Python podle nabídnutého postupu (správce instalací nebo instalátor). Otevřete z nabídky Start Terminál či PowerShell. Zadejte `python --version`; lze použít také `py --version`. Pokud se místo verze otevře Store, dokončete instalaci a otevřete nový terminál. `PATH` je seznam adresářů, ve kterých systém hledá příkazy; při potížích postupujte podle [oficiálního návodu](https://docs.python.org/3/using/windows.html).
- **macOS:** stáhněte instalátor z [python.org](https://www.python.org/downloads/macos/), otevřete aplikaci Terminál a zadejte `python3 --version`.
- **Linux:** použijte správce balíčků distribuce. Například Debian/Ubuntu: `sudo apt install python3 python3-venv python3-pip`. Otevřete Terminál a zadejte `python3 --version`. Pokud je verze starší než 3.12, potřebujete novější podporovaný balíček; nenahrazujte ručně systémový Python.

Verze musí být alespoň 3.12. Příkaz `python` (Windows) nebo `python3` (macOS/Linux) bez argumentů otevře interaktivní interpret. Za výzvou `>>>` napište `print("Ahoj")` a stiskněte Enter: objeví se `Ahoj`. Výzvu `>>>` neopisujte. Příkazem `exit()` se vrátíte do terminálu.

## 2. Příklad :id=_2-example

**Samostatný příklad:** v nové pracovní složce uložte soubor `first_script.py` jako UTF-8:

```python
print("Ahoj")
```

V terminálu přejděte příkazem `cd` do této složky (například `cd "C:\projekty\python"`). **Virtuální prostředí** vytvořené modulem `venv` odděluje knihovny jednoho projektu od ostatních. Nástroj **pip** do něj instaluje další knihovny. Zápis `-m pip` spustí pip příslušného interpretu. První příklad další knihovnu nepotřebuje.

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip --version
.\.venv\Scripts\python.exe first_script.py
```

Pokud vaše instalace poskytuje příkaz `py`, lze první řádek napsat `py -m venv .venv`.

macOS/Linux:

```bash
python3 -m venv .venv
.venv/bin/python -m pip --version
.venv/bin/python first_script.py
```

Skript vypíše:

```text
Ahoj
```

Výpis `pip --version` obsahuje verzi a cestu uvnitř `.venv`; liší se podle instalace. Aktivace prostředí není nutná, protože zadáváte přímo cestu jeho interpretu. Takto spouštějte i další příklady průvodce. Příkazy `python -m pip install …` v dalších kapitolách znamenají tento interpret: na Windows `.\.venv\Scripts\python.exe`, na macOS/Linux `.venv/bin/python`.

## 3. Kdy použít :id=_3-when-to-use

Python se hodí pro krátkou automatizaci i větší aplikace. Pro každý projekt vytvořte vlastní `.venv`.

## 4. Časté chyby :id=_4-common-mistakes

- Soubor nepojmenovávejte stejně jako knihovnu, například `json.py`; zastínil by její import.
- Instalujte a spouštějte knihovny stejným interpretem. Závislosti zapisujte například do `requirements.txt`; prostředí samo jejich verze nezaznamená.
- Virtuální prostředí odděluje knihovny, ale program v něm stále má přístup k vašim souborům.

<details>
<summary>Volitelné podrobnosti: Jiné implementace</summary>

Existuje také PyPy. Některé knihovny na něm nefungují, proto při začátku použijte běžný CPython.

</details>

**Související témata:** [Základní syntaxe](Zakladni_syntaxe.md), [Moduly a balíčky](../B/Moduly_a_balicky.md).
