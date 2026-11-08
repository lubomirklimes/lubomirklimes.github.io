# Unity a C# – herní engine

Unity spravuje scény, objekty a herní smyčku. Níže jsou komponenty pro API Unity 6 (6000.0); patří do projektu v Unity Editoru, ne do konzolového programu .NET 10/C# 14. Dostupnou verzi C#, runtime a balíčky určuje konkrétní verze Unity Editoru.

## Základní struktura skriptu

`MonoBehaviour` je základ komponent připojitelných k GameObject, nikoli všech C# tříd. `Start` se volá před prvním Update aktivní komponenty, ne při každém jejím opětovném zapnutí. `Update` reaguje na snímky; deltaTime je krok času, ne záruka totožného výsledku při libovolném FPS (počtu snímků za sekundu).

**Skript `HracPohyb.cs`** připojený k objektu bez dynamické Rigidbody fyziky. Používá starší Input Manager; v Active Input Handling musí být Input Manager (Old) nebo Both a existovat osy Horizontal/Vertical.

```csharp
using UnityEngine;
public sealed class HracPohyb : MonoBehaviour
{
    [SerializeField] private float rychlost = 5f;
    private void Update()
    {
        var smer = new Vector3(Input.GetAxis("Horizontal"), 0f, Input.GetAxis("Vertical"));
        smer = Vector3.ClampMagnitude(smer, 1f);
        transform.Translate(smer * rychlost * Time.deltaTime, Space.World);
    }
}
```

Omezení velikosti směru zabrání rychlejší diagonále; analogové malé hodnoty nezvětšujeme na plnou rychlost. Pohyb je ve světových osách X/Z. Pokud pohyb řídí fyzika, nepřepisujte současně transform a Rigidbody; práci s tělesem přesuňte do pevného fyzikálního kroku.

## Fyzika a kolize

**Skript `Projektil.cs`**, 3D fyzika s Collider, odpovídající Rigidbody konfigurací a definovaným tagem Nepritel. Dvě statická tělesa bez vhodného Rigidbody běžnou kolizní reakci tohoto typu nezaručují.

```csharp
using UnityEngine;
public sealed class Projektil : MonoBehaviour
{
    private void OnCollisionEnter(Collision collision)
    {
        if (!collision.gameObject.CompareTag("Nepritel")) return;
        Destroy(collision.gameObject);
        Destroy(gameObject);
    }
}
```

Pro 2D použijte Rigidbody2D/Collider2D a odpovídající callbacky. Zásah není důkazem fyzikální přesnosti; záleží i na rychlosti, detekčním režimu a časovém kroku. [Fyzika a kolize](GamePhysics.md).

## Hledání objektů a komponent

Reference předejte přes Inspector nebo uložte při inicializaci; neopakujte globální hledání zbytečně v každém snímku. Chybějící objekt i komponentu ošetřete.

**Fragment:** tělo metody `MonoBehaviour`, import UnityEngine, tag Player existuje. Impuls vyvolá aplikace jednou, ne automaticky každý Update.

```csharp
var hrac = GameObject.FindWithTag("Player");
if (hrac != null && hrac.TryGetComponent<Rigidbody>(out var telo))
    telo.AddForce(Vector3.up * 5f, ForceMode.Impulse);
```

Pro `Instantiate` dodejte prefab (šablonu objektu) a pozici; typ prefab musí obsahovat očekávané komponenty. Tag není spolehlivé náhradní zabezpečení ani identita síťového hráče.

## UI v Unity

**Skript `HUDManager.cs`**, TextMeshPro a přiřazený textový prvek v Inspectoru. Prázdná reference nezpůsobí NullReferenceException, ale chybějící přiřazení stále opravte ve scéně.

```csharp
using TMPro;
using UnityEngine;
public sealed class HUDManager : MonoBehaviour
{
    [SerializeField] private TMP_Text labelBody;
    public void NastavBody(int body)
    {
        if (labelBody != null) labelBody.text = $"Body: {body}";
    }
}
```

Text se aktualizuje jen při změně skóre, ne v každém snímku; metodu volá kód, který skóre spravuje. Starší komponenta `UnityEngine.UI.Text` je jiný typ než `TMP_Text`.

## Korutiny a čekání :id=korutiny-async-operace-bez-asyncawait

**Skript `PozdniPozdrav.cs`** na aktivním objektu. Korutina nepřidává pracovní vlákno; synchronní těžký kód v ní stále blokuje hlavní smyčku.

```csharp
using System.Collections;
using UnityEngine;
public sealed class PozdniPozdrav : MonoBehaviour
{
    private void Start() => StartCoroutine(Pozdrav());
    private IEnumerator Pozdrav()
    {
        yield return new WaitForSeconds(1f);
        Debug.Log("Čekání ve hře skončilo.");
    }
}
```

WaitForSeconds používá škálovaný herní čas a pokračování je v některém následujícím snímku, nikoli přesně po sekundě nástěnných hodin. Pro neškálovaný čas je jiná čekací instrukce. Životnost korutiny souvisí s objektem, není zaměnitelná s libovolným `Task`.

<details>
<summary>Volitelné: animace, sdílená data a nový Input System</summary>

Animator potřebuje přiřazený controller a správně pojmenované parametry před voláním SetBool/SetTrigger. ScriptableObject ukládá sdílená data v assetu; změna za běhu není automatický systém ukládání hry.

**Skript `ZbraneData.cs`**, ze kterého lze v Unity vytvořit asset.

```csharp
using UnityEngine;
[CreateAssetMenu(fileName = "ZbraneData", menuName = "Hra/Zbraně")]
public sealed class ZbraneData : ScriptableObject
{
    public string Nazev = "";
    public float Poskozeni = 10f;
}
```

Nový Input System je balíček `com.unity.inputsystem`; akce a způsob jejich zapojení musíte nakonfigurovat. Samotné pojmenování metody OnMove callback nezaregistruje. Nespojujte starý Input příklad s projektem, který podporuje výhradně nový systém. [Unity API](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/MonoBehaviour.html).

</details>
