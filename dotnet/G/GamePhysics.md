# Fyzika a kolize ve hrách

Herní fyzika je numerický model, nikoli přesná simulace skutečného světa. Volba jednotek, časového kroku a detekce kolizí ovlivňuje výsledek; stejný delta čas sám negarantuje determinismus mezi platformami.

## Fyzika v Unity

Následující části cílí na 3D API Unity 6 a patří do projektu v Unity Editoru, ne do konzolového programu .NET. Unity 3D používá PhysX; 2D fyzika má jiné komponenty i callbacky. Rigidbody popisuje pohyb tělesa, Collider jeho kolizní tvar.

### Rigidbody – fyzikální těleso

**Skript `ProjektilImpuls.cs`** na objektu s Collider a dynamickou Rigidbody. Impuls mění hybnost; výsledná změna rychlosti závisí na hmotnosti.

```csharp
using UnityEngine;
[RequireComponent(typeof(Rigidbody))]
public sealed class ProjektilImpuls : MonoBehaviour
{
    private void Start()
    {
        var telo = GetComponent<Rigidbody>();
        telo.useGravity = true;
        telo.AddForce(transform.forward * 10f, ForceMode.Impulse);
    }
}
```

Opakované síly pro simulaci aplikujte podle účelu ve FixedUpdate, ne podle frekvence Draw/Update. Vstupní jednorázovou událost případně zachyťte v Update a spotřebujte jednou ve fyzikálním kroku. [FixedUpdate](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/MonoBehaviour.FixedUpdate.html).

### Kolize

**Metoda** uvnitř `MonoBehaviour` s importem UnityEngine a nastavenými kolizními vrstvami.

```csharp
private void OnCollisionEnter(Collision collision)
{
    if (collision.contactCount > 0)
        Debug.Log($"Bod dopadu: {collision.GetContact(0).point}");
}
```

Trigger používá `OnTriggerEnter(Collider other)` a odpovídající isTrigger konfiguraci; sám neprovádí fyzickou reakci. Vrstvy a collision matrix určují, které dvojice se vůbec vyhodnocují. Rychlé těleso může vyžadovat průběžnou detekci místo pouhého zmenšování kroku.

<span id="raycast-detekce-objektu-pod-kurzorem-v-směru"></span>

### Raycast – hledání zásahu ve směru

**Metoda** `MonoBehaviour` s importem UnityEngine. Kamera a souřadnice obrazovky přicházejí od volajícího, například ze správně nastaveného input systému.

```csharp
public bool ZkusZasah(Camera kamera, Vector2 obrazovka, out RaycastHit zasah)
{
    if (kamera == null) { zasah = default; return false; }
    var paprsek = kamera.ScreenPointToRay(obrazovka);
    return Physics.Raycast(paprsek, out zasah, maxDistance: 100f,
        layerMask: ~0, queryTriggerInteraction: QueryTriggerInteraction.Ignore);
}
```

Pojmenovaný argument musí odpovídat názvu parametru v API Unity, zde **maxDistance**. Layer mask je bitový filtr vrstev, nikoli číslo jedné vrstvy. `~0` zde povoluje všechny; podle hry filtr zpřesněte. Raycast není automaticky kontrola objemového pohybu tělesa.

<span id="fyzika-v-monogame-ruční-implementace"></span>

## Fyzika v MonoGame a vlastní model

MonoGame nemá hotovou obecnou fyziku. Lze přidat kompatibilní 2D knihovnu, například Aether.Physics2D, s jejími vlastními typy a verzí; světové metry a osu Y mapujte na obrazovkové pixely výslovně. Krok knihovny držte podle jejího doporučení stabilní; při velkém zpoždění použijte omezené dohánění místo neomezeného kroku.

**Samostatný konzolový `Program.cs`** (.NET 10 / C# 14). Záměrně zjednodušený jednorozměrný pád: Y v metrech roste nahoru, V je v metrech za sekundu a dt v sekundách; hmotnost nemění gravitační zrychlení, zem je y=0, bez odrazu a odporu. Jde o čistý C# bez Unity či Aether.

```csharp
var stav = (Y: 1.0, V: 0.0);
for (int i = 0; i < 100; i++) stav = Krok(stav.Y, stav.V, 0.01);
Console.WriteLine(stav.Y == 0 && stav.V == 0 ? "Těleso stojí na zemi." : "Těleso je ve vzduchu.");
try { Krok(1, 0, -0.01); }
catch (ArgumentOutOfRangeException) { Console.WriteLine("Neplatný krok odmítnut."); }
static (double Y, double V) Krok(double y, double v, double dt)
{
    if (!double.IsFinite(dt) || dt <= 0 || dt > 0.1)
        throw new ArgumentOutOfRangeException(nameof(dt));
    if (!double.IsFinite(y) || !double.IsFinite(v) || y < 0)
        throw new ArgumentException("Neplatný stav tělesa.");
    v -= 9.81 * dt;
    y += v * dt;
    return y <= 0 ? (0, 0) : (y, v);
}
```

Výstup: `Těleso stojí na zemi.` a `Neplatný krok odmítnut.`. Metoda používá semiimplicitní Eulerův krok a při průniku stav ořízne k zemi. Je to demonstrace kontraktu a krokování, ne řešič přesného času nárazu.

<span id="základní-fyzikální-koncepty-ve-hrách"></span>

## Základní fyzikální pojmy

| Pojem | Význam |
|---|---|
| Těleso / collider | Dynamický stav / geometrie kontaktu |
| Impuls / síla | Jednorázová změna hybnosti / působení v čase |
| Trigger / raycast | Oznámení překryvu / dotaz paprskem |
| Pevný krok | Zvolený časový interval simulace, nezávislý na počtu vykreslení |

Pro testy zafixujte počáteční stav, kroky a tolerance; nevyvozujte z jednoho testu přesnost či bezpečnost skutečného fyzikálního zařízení.
