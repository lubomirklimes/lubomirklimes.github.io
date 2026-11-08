# Práce s databázemi v cloudu

Cloud mění provoz databáze, nikoli potřebu správných transakcí a validace. Relační databáze pracuje s tabulkami a vazbami; dokumentová databáze ukládá dokumenty podle svého datového a distribučního modelu. Příklady cílí na .NET 10 / C# 14; poskytovatele a SDK volíte zvlášť.

## SQL Server / Azure SQL s Entity Framework Core

EF Core je ORM: mapuje C# objekty na tabulky a SQL operace. Než se k němu dostaneme, malý lokální SQL příklad bez ORM ukáže parametrizaci a transakci (skupinu změn, které se potvrdí společně, nebo vrátí zpět). Běží nad SQLite, takže nepotřebuje server ani cloud.

### Parametry a transakce (SQLite, bez ORM)

**Samostatný `Program.cs`**, `dotnet new console -f net10.0`, balíček `Microsoft.Data.Sqlite` řady 10.0.x. Instalace: `dotnet add package Microsoft.Data.Sqlite --version 10.0.*`. Paměťová databáze žije jen po dobu připojení, žádný cloud ani soubor se nemění.

```csharp
using Microsoft.Data.Sqlite;
using var db = new SqliteConnection("Data Source=:memory:");
await db.OpenAsync();
using (var schema = db.CreateCommand())
{
    schema.CommandText = "CREATE TABLE Produkty (Nazev TEXT NOT NULL, CenaHalere INTEGER NOT NULL CHECK(CenaHalere > 0))";
    await schema.ExecuteNonQueryAsync();
}
using (var tx = db.BeginTransaction())
{
    await Vloz(db, tx, "O'Brien", 2990);
    tx.Commit();
}
using (var tx = db.BeginTransaction())
{
    await Vloz(db, tx, "Vrátit zpět", 100);
    tx.Rollback();
}
try { await Vloz(db, null, "Neplatné", 0); }
catch (SqliteException ex) when (ex.SqliteErrorCode == 19)
{
    Console.WriteLine("Neplatná cena odmítnuta.");
}
using var dotaz = db.CreateCommand();
dotaz.CommandText = "SELECT COUNT(*) FROM Produkty";
Console.WriteLine($"Produktů: {await dotaz.ExecuteScalarAsync()}");
dotaz.CommandText = "SELECT Nazev FROM Produkty";
Console.WriteLine(await dotaz.ExecuteScalarAsync());
static async Task Vloz(SqliteConnection db, SqliteTransaction? tx, string nazev, long halere)
{
    using var cmd = db.CreateCommand();
    cmd.Transaction = tx;
    cmd.CommandText = "INSERT INTO Produkty (Nazev, CenaHalere) VALUES ($nazev, $cena)";
    cmd.Parameters.AddWithValue("$nazev", nazev);
    cmd.Parameters.AddWithValue("$cena", halere);
    await cmd.ExecuteNonQueryAsync();
}
```

Výstup: `Neplatná cena odmítnuta.`, `Produktů: 1`, `O'Brien`. Kód chyby 19 je `SQLITE_CONSTRAINT`, tedy porušení omezení (zde `CHECK`). Apostrof není SQL kód, protože je hodnotou parametru. SQLite zde peníze ukládá v celých haléřích; v řadě detailů se chová jinak než SQL Server. Jeho asynchronní API nemusí provádět skutečné asynchronní diskové I/O.

### EF Core pro SQL Server a Azure SQL

Pro EF Core/SQL Server použijte balíček `Microsoft.EntityFrameworkCore.SqlServer` řady odpovídající projektu; nástroje i provider držte ve sladěné verzi.

**Soubor `AppDbContext.cs`** ve webovém projektu s EF Core.

```csharp
using Microsoft.EntityFrameworkCore;
public sealed class Produkt
{
    public int Id { get; set; }
    public string Nazev { get; set; } = "";
    public decimal Cena { get; set; }
}
public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Produkt> Produkty => Set<Produkt>();
    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<Produkt>().Property(p => p.Nazev).IsRequired().HasMaxLength(100);
        model.Entity<Produkt>().Property(p => p.Cena).HasPrecision(12, 2);
    }
}
```

**Registrace** před `builder.Build()`, s importem `Microsoft.EntityFrameworkCore`. Připojení má používat ověřenou identitu nebo bezpečně dodané tajemství a šifrovaný přenos; kontrolu certifikátu serveru nevypínejte.

```csharp
string spojeni = builder.Configuration.GetConnectionString("Default")
    ?? throw new InvalidOperationException("Chybí připojení k databázi.");
builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlServer(spojeni));
```

DbContext je zde scoped a není bezpečný pro souběžné operace. Ve službě s `AppDbContext db` a tokenem `ct` lze po validaci vložit entitu, volat `SaveChangesAsync(ct)` a dotazovat přes `AsNoTracking().Where(...).ToListAsync(ct)`. Jedno SaveChanges je běžně transakční; více zápisů a externí účinky potřebují vlastní návrh transakce či outboxu (zprávy uložené spolu s daty před následným odesláním). Parametrizujte vstup i u ručního SQL.

## Migrace schématu

`EnsureCreated` není náhradou spravovaných migrací. Pro `dotnet ef` potřebujete lokální nástroj `dotnet-ef` a projektový balíček `Microsoft.EntityFrameworkCore.Design`, ne pouze Tools balíček pro Visual Studio. V nástrojovém manifestu připněte zvolenou sladěnou verzi, poté můžete připravit `dotnet ef migrations add PrvniMigrace` a zkontrolovaný migrační skript. Aktualizaci produkční DB nespouštějte automaticky při startu všech replik. SQLite ukázka výše migrace nepoužívá; migrace i dotazy zkoušejte proti stejnému typu databáze, jaký poběží v provozu.

## Azure Cosmos DB (NoSQL)

Partition key rozděluje data do logických oddílů. Spolu s `id` identifikuje položku; musí odpovídat nastavené cestě kontejneru. Volba klíče ovlivňuje dotazy i škálování. Konzistence je nastavení s konkrétními kompromisy, transakce mají vymezený rozsah, nikoli automaticky všechny oddíly.

**Fragment** asynchronní metody se sdíleným `CosmosClient client`, tokenem `ct`, balíčkem `Microsoft.Azure.Cosmos` a existujícím kontejnerem s partition cestou `/tenantId`.

```csharp
using Microsoft.Azure.Cosmos;
var container = client.GetContainer("MojeDB", "Produkty");
var produkt = new { id = "1", tenantId = "ukazka", nazev = "Kniha", cenaHalere = 2990L };
await container.CreateItemAsync(produkt, new PartitionKey(produkt.tenantId), cancellationToken: ct);
var response = await container.ReadItemAsync<Dictionary<string, object>>(
    "1", new PartitionKey("ukazka"), cancellationToken: ct);
```

Při opakovaném vytvoření může nastat konflikt; tenant z klientského vstupu není důkaz oprávnění. Dlouho žijící CosmosClient sdílejte a uvolněte s hostitelem.

## Distribuovaná cache s Redis :id=azure-cache-for-redis

Cache urychluje opakované čtení, může však vypršet či být vyřazena; zdroj pravdy má zůstat v trvalém úložišti. Rozhraní `IDistributedCache` neznamená, že libovolná implementace přežije restart.

**Registrace** před `Build()` s balíčkem `Microsoft.Extensions.Caching.StackExchangeRedis` (samotný balíček StackExchange.Redis tuto metodu nemá).

```csharp
builder.Services.AddStackExchangeRedisCache(o =>
    o.Configuration = builder.Configuration["Redis:ConnectionString"]
        ?? throw new InvalidOperationException("Chybí konfigurace cache."));
```

Služba s `IDistributedCache` z `Microsoft.Extensions.Caching.Distributed` může použít `SetStringAsync` s `DistributedCacheEntryOptions.AbsoluteExpirationRelativeToNow` a tokenem. Při nenalezení položky načte data ze zdroje; navrhněte invalidaci a souběh. Pro Azure ověřte aktuální nabídku a migrační směr z Azure Cache for Redis k Azure Managed Redis.

## Výběr produkční databáze

| Služba | Rozhodující požadavek |
|---|---|
| Azure SQL | Relační vazby, SQL a transakce |
| Cosmos DB | Model oddílů, distribuované dokumenty a zvolená konzistence |
| Redis | Rychlá cache či sdílený pomocný stav s navrženou obnovou |
| Table Storage | Klíčové dotazy podle PartitionKey/RowKey a omezené transakce oddílu |

Cenu a kapacitu stanovte z měření a aktuální nabídky. [SQLite parametry](https://learn.microsoft.com/en-us/dotnet/standard/data/sqlite/parameters), [EF transakce](https://learn.microsoft.com/en-us/ef/core/saving/transactions).
