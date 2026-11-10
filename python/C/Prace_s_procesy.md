# Práce s procesy

`subprocess` spouští externí program a umožní řídit jeho vstup, výstup a životnost. Pro běžné vyčkání na výsledek použijte `run()`, pro řízenou interakci `Popen`.

## Princip :id=_1-concept

Příkaz předávejte jako seznam argumentů s výchozím `shell=False`. Každá položka představuje jeden argument, včetně cest s mezerami; nepřidávejte do položek ručně shellové uvozovky. `sys.executable` vybere stejný Python jako rodič, na rozdíl od neurčitého `python` z PATH. Pro jiné nástroje určete důvěryhodný spustitelný soubor a povolené argumenty.

Návratový kód 0 obvykle znamená úspěch. `check=True` při nenulovém kódu vyvolá `CalledProcessError`, kde je kód i zachycený výstup. Neexistující program vyvolá `FileNotFoundError` (podtřídu `OSError`) již při spuštění; není to návratový kód potomka. `capture_output=True` zachytí standardní výstup (`stdout`) a diagnostiku (`stderr`) odděleně.

## Příklady :id=_2-example

**Samostatný příklad:** první proces vrátí textový argument včetně mezer a shellových znaků beze změny, druhý skončí chybou, třetí překročí timeout. `-X utf8` určuje kódování výstupu potomka; `encoding` určuje dekódování na straně rodiče.

```python
import subprocess
import sys

result = subprocess.run(
    [sys.executable, "-X", "utf8", "-c", "import sys; print(sys.argv[1])", "žluťoučký & text"],
    capture_output=True, text=True, encoding="utf-8", check=True, timeout=5,
)

print(result.stdout.strip())

try:
    subprocess.run(
        [sys.executable, "-X", "utf8", "-c", "import sys; print('chyba', file=sys.stderr); sys.exit(7)"],
        capture_output=True, text=True, encoding="utf-8", check=True, timeout=5,
    )
except subprocess.CalledProcessError as exc:

    print(f"Proces skončil kódem {exc.returncode}")
    print("stderr potomka:", exc.stderr.strip())

try:
    subprocess.run(
        [sys.executable, "-c", "import time; time.sleep(30)"],
        capture_output=True, check=True, timeout=0.1,
    )
except subprocess.TimeoutExpired:
    print("Vypršel timeout")
```

Výstup:

```text
žluťoučký & text
Proces skončil kódem 7
stderr potomka: chyba
Vypršel timeout
```

Výstup tvoří `žluťoučký & text`, `Proces skončil kódem 7`, `stderr potomka: chyba` a `Vypršel timeout`. `run(timeout=...)` při vypršení přímého potomka ukončí a vyčká na něj, než výjimku předá. Vytvoření procesu však nemusí být přerušitelné a timeout není záruka přesné maximální doby celé funkce.

**Samostatný příklad:** `Popen.communicate()` při timeoutu samo potomka nezabije. Volající musí proces ukončit a počkat na něj pomocí `communicate()`, které přečte oba výstupy a zjistí návratový kód.

```python
import subprocess
import sys

with subprocess.Popen(
    [sys.executable, "-c", "import time; time.sleep(30)"],
    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
) as process:
    try:
        stdout, stderr = process.communicate(timeout=0.1)
    except subprocess.TimeoutExpired:
        process.kill()
        stdout, stderr = process.communicate()

print("Potomek byl ukončen; čekání dokončeno")
```

Výstup:

```text
Potomek byl ukončen; čekání dokončeno
```

Tato varianta demonstruje timeout a úklid, nikoli obecné uživatelské zrušení. Při jiném přerušení aplikace také určete, kdo potomka zastaví a vyčká na něj. Samotný context manager `Popen` při opuštění čeká; není automatickou politikou rychlého zrušení.

**Fragment — vyžaduje nainstalovaný Git dostupný v `PATH`:** `PATH` je seznam složek, ve kterých systém hledá programy.

```python
import subprocess

try:
    result = subprocess.run(["git", "--version"], capture_output=True, text=True, check=True, timeout=5)
    print(result.stdout.strip())
except FileNotFoundError:
    print("Git není dostupný; nainstalujte jej a otevřete nový terminál.")
```

Výstup má tvar `git version …`; číslo závisí na instalaci. Tento příkaz pouze přečte verzi.

## Kdy použít a jak spravovat výstup :id=_3-when-to-use

Použijte subprocess pro existující CLI nástroje nebo izolovanou pomocnou operaci. `cwd=` nastaví pracovní adresář jen potomkovi. `env=` nahrazuje jeho prostředí; pokud chcete jen upravit jednu hodnotu, vyjděte z kopie `os.environ`, jinak můžete odstranit potřebné proměnné.

`capture_output` a `communicate()` drží výstup v paměti. Pro velké výstupy směrujte do vámi vlastněného souboru nebo navrhněte průběžné čtení. Roura je kanál pro předávání dat mezi procesy. Nečtěte synchronně do konce jen stdout, zatímco stderr zůstává plnou rourou: oba procesy se mohou navzájem zablokovat. `communicate()` obě roury obsluhuje, ale neomezuje jejich velikost.

## Časté chyby :id=_4-common-mistakes

`shell=True` zapíná interpretaci shellu a přidává další pravidla uvozování a expanze. Nepřipojujte k němu nedůvěryhodný vstup. `shell=False` však neověřuje význam argumentů ani důvěryhodnost spouštěného programu. Na Windows mohou `.bat`/`.cmd` soubory podléhat shellové interpretaci i bez výslovného shell=True; ukázky spouštějí přímo spustitelný soubor Pythonu.

U `TimeoutExpired` může být zachycený výstup v bajtech i při textovém režimu; nedekódujte jej naslepo podruhé. Zabít přímého potomka obecně neznamená ukončit celý strom jeho dalších procesů. Skupiny procesů, signály a Windows job objekty vyžadují platformní řešení.

<details>
<summary>Volitelné podrobnosti: zrušení a dlouho běžící nástroje</summary>

`terminate()` a `kill()` mají platformně odlišné chování; na Windows obě používají ukončení procesu, na POSIX typicky SIGTERM a SIGKILL. Pokud program podporuje vlastní korektní ukončení, dejte mu nejprve omezenou možnost dokončit úklid a teprve pak vynuťte konec. Vždy musí následovat `wait()` či `communicate()`, aby rodič získal návratový kód a systém uvolnil záznam procesu.

Pro interaktivní protokol sledujte i buffering potomka a pravidla ukončení stdin. Neomezené spouštění paralelních procesů nezajišťuje vyšší výkon; omezte souběh podle zdrojů a chování konkrétního nástroje. Citlivé argumenty mohou být viditelné v seznamu procesů, proto pro tajné vstupy zvolte podporovaný vhodnější kanál.

</details>

## Související témata

- [Práce se soubory a OS](Prace_se_soubory_a_OS.md) — pracovní adresář a prostředí.
- [Logování](Logging.md) — diagnostika chyby procesu.
- [CLI aplikace](CLI_aplikace.md) — argumenty a návratové kódy vlastního nástroje.
