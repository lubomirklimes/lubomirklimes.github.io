# MonoGame – herní framework pro C#

MonoGame poskytuje herní smyčku, grafiku, zvuk a vstup, nikoli celý vizuální editor scén. API XNA/MonoGame má vlastní balíčky a podporované cíle; dostupnost platformy, grafického backendu a SDK není odvozena jen z instalace .NET 10.

## 1. Princip :id=_1-koncept

### Herní smyčka

`Update` mění herní stav, `Draw` jej vykresluje. Při pevném kroku může být více Update mezi dvěma Draw, při dohánění se vykreslení může vynechat. `ElapsedGameTime` je čas kroku simulace, nemusí být prostý interval mezi dvěma obrazy na monitoru. Vynásobení rychlosti v jednotkách za sekundu tímto časem neřeší samo numerickou stabilitu ani dlouhé výpadky. [Pevný a proměnlivý krok](https://docs.monogame.net/articles/getting_to_know/howto/HowTo_VariableStepGameLoop.html).

### Příprava obsahu :id=content-pipeline

MGCB (MonoGame Content Builder) připravuje obrázky, zvuky a fonty pro content pipeline. Vstupy i zvolené procesory musejí existovat a vyhovovat cílové platformě. Pro níže uvedený čtverec není obrázkový asset potřeba: vytvoříme jediný pixel programově.

## 2. Příklad

<span id="kompletní-pohybující-se-hráč"></span>

### Pohybující se hráč bez externího obrázku

**Soubor `Program.cs`** v desktopovém projektu MonoGame (DesktopGL). Projekt vytvořte ze šablon MonoGame: `dotnet new install MonoGame.Templates.CSharp` a potom `dotnet new mgdesktopgl -n MojeHra`. Šablona přidá balíček `MonoGame.Framework.DesktopGL` i nástroje pro obsah; vygenerované `Program.cs` a třídu hry nahraďte těmito dvěma soubory.

```csharp
using var hra = new MojeHra();
hra.Run();
```

**Soubor `MojeHra.cs`** ve stejném projektu. Vytvořené GPU prostředky vlastní hra; ve hře je +X doprava a +Y dolů, pozice je levý horní roh čtverce. Rychlost pohybu je 200 pixelů za sekundu.

```csharp
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Microsoft.Xna.Framework.Input;
public sealed class MojeHra : Game
{
    private readonly GraphicsDeviceManager graphics;
    private SpriteBatch? batch;
    private Texture2D? pixel;
    private Vector2 pozice = new(384, 284);
    public MojeHra()
    {
        graphics = new GraphicsDeviceManager(this)
        { PreferredBackBufferWidth = 800, PreferredBackBufferHeight = 600 };
        IsFixedTimeStep = true;
        TargetElapsedTime = TimeSpan.FromSeconds(1.0 / 60);
        IsMouseVisible = true;
    }
    protected override void LoadContent()
    {
        batch = new SpriteBatch(GraphicsDevice);
        pixel = new Texture2D(GraphicsDevice, 1, 1);
        pixel.SetData(new[] { Color.White });
    }
    protected override void Update(GameTime gameTime)
    {
        var keys = Keyboard.GetState();
        if (keys.IsKeyDown(Keys.Escape)) Exit();
        var smer = new Vector2(
            (keys.IsKeyDown(Keys.Right) ? 1 : 0) - (keys.IsKeyDown(Keys.Left) ? 1 : 0),
            (keys.IsKeyDown(Keys.Down) ? 1 : 0) - (keys.IsKeyDown(Keys.Up) ? 1 : 0));
        if (smer.LengthSquared() > 1) smer.Normalize();
        pozice += smer * 200f * (float)gameTime.ElapsedGameTime.TotalSeconds;
        base.Update(gameTime);
    }
    protected override void Draw(GameTime gameTime)
    {
        GraphicsDevice.Clear(Color.CornflowerBlue);
        if (batch is not null && pixel is not null)
        {
            batch.Begin();
            batch.Draw(pixel, new Rectangle((int)pozice.X, (int)pozice.Y, 32, 32), Color.Yellow);
            batch.End();
        }
        base.Draw(gameTime);
    }
    protected override void UnloadContent()
    {
        pixel?.Dispose();
        batch?.Dispose();
        base.UnloadContent();
    }
}
```

<span id="detekce-kolizí-aabb-axis-aligned-bounding-box"></span>

### Kolize obdélníků AABB

AABB je osově zarovnaný ohraničující obdélník. Je levnou aproximací tvaru; přesnější tvary stojí víc výpočtu.

**Fragment** do `Update` předchozí třídy `MojeHra`, import `Microsoft.Xna.Framework`. Rozhodněte také, zda má být kolizí i pouhý dotyk hran: `Intersects` jej za kolizi nepovažuje.

```csharp
var hrac = new Rectangle((int)pozice.X, (int)pozice.Y, 32, 32);
var prekazka = new Rectangle(500, 300, 20, 80);
Window.Title = hrac.Intersects(prekazka) ? "Kolize." : "Bez kolize.";
```

### Zobrazení textu

**Fragment:** řádky na dvou místech stejné hry. Potřebují pole `SpriteFont font`, fontový zdroj `PixelFont` v MGCB a nenulový `batch`; font ukázka nedodává.

```csharp
// V LoadContent:
font = Content.Load<SpriteFont>("PixelFont");
// V Draw uvnitř již otevřeného Begin/End:
batch.DrawString(font, "Skóre: 3", new Vector2(10, 10), Color.White);
```

## 3. Kdy použít

Framework je vhodný pro vlastní herní smyčku a vykreslování. Platformní backendy, mobilní balení a konzolové SDK mají odlišné požadavky a přístupy; jedna kódová základna neznamená automatickou distribuci na všechny cíle. Vstupní zařízení a ztrátu grafického kontextu ověřujte na cílovém systému.

## 4. Časté chyby

- Aktualizovat stav v Draw a odvozovat simulaci od počtu vykreslení.
- Vytvářet SpriteBatch/textury v každém snímku; vlastněné prostředky připravte a uvolněte podle životního cyklu.
- Považovat jeden Begin/End za záruku jediného GPU volání.
- Vynechat `base.Update`/`base.Draw`, pokud očekáváte zpracování registrovaných herních komponent (`Game.Components`).

<details>
<summary>Volitelné: dávkování, herní stavy a zvuk</summary>

<span id="jak-spritebatch-optimalizuje-vykreslování"></span>

### Dávkování SpriteBatch

Dávkování sdružuje kreslení, ale počet GPU volání závisí na texturách, efektech, kapacitě dávky i režimu řazení. `SpriteSortMode.Texture` může omezit přepínání textur, současně ale změnit pořadí průhledných objektů; nepoužívejte jej slepě pro každou scénu. [SpriteBatch API](https://docs.monogame.net/api/Microsoft.Xna.Framework.Graphics.SpriteBatch.html).

### Řízení herních stavů :id=game-state-management

**Samostatný konzolový `Program.cs`** (.NET 10 / C# 14) bez MonoGame. Logiku stavů lze takto zkoušet bez GPU.

```csharp
foreach (var stav in Enum.GetValues<HerniStav>()) Console.WriteLine(Popis(stav));
try { Console.WriteLine(Popis((HerniStav)99)); }
catch (ArgumentOutOfRangeException) { Console.WriteLine("Neplatný stav odmítnut."); }
static string Popis(HerniStav stav) => stav switch
{
    HerniStav.Menu => "Menu", HerniStav.Hra => "Hra",
    HerniStav.Pauza => "Pauza", HerniStav.Konec => "Konec",
    _ => throw new ArgumentOutOfRangeException(nameof(stav))
};
public enum HerniStav { Menu, Hra, Pauza, Konec }
```

Výstup má čtyři pojmenované stavy a odmítnutí neplatného. Skutečné přechody a pauzu Update definujte podle hry.

### Zvuk :id=audio

SoundEffect a Song mají vlastní načítání a životnost. Obsah `Content.Load<SoundEffect>("vybuch")` nebo `Content.Load<Song>("hudba")` vyžaduje připravené a licencované vstupy. Přehrávání může selhat či narazit na limit hlasů; výsledek a hlasitost řešte podle backendu. MediaPlayer používá globální stav hudby, není samostatnou instancí pro každou entitu.

</details>
