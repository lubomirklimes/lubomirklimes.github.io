# gRPC

gRPC je RPC framework: klient vyvolává typované vzdálené procedury podle kontraktu. Protocol Buffers (protobuf) popisuje zprávy a jejich binární formát, běžné gRPC používá HTTP/2. Velikost a rychlost oproti JSON závisejí na datech a provozu; ověřte je měřením.

## 1. Princip :id=_1-koncept

| Komunikace | Počet zpráv |
|---|---|
| Jednotlivé volání (unary) | Jeden požadavek, jedna odpověď |
| Serverový proud | Jeden požadavek, více odpovědí |
| Klientský proud | Více požadavků, jedna odpověď |
| Obousměrný proud | Více zpráv v obou směrech |

Z `.proto` překladač generuje datové typy, klienta a základ serverové třídy. Čísla polí tvoří součást kontraktu: při evoluci je nepřidělujte jinému významu. Cíl příkladu je .NET 10 / C# 14.

## 2. Příklad

### Kontrakt v proto souboru :id=proto-soubor

**Soubor `Protos/objednavky.proto`.** Z něj se při sestavení generují C# typy. Částku přenášíme jako celé haléře a kód měny. `double` by obecnou desetinnou peněžní částku nemusel zachovat přesně.

```protobuf
syntax = "proto3";
option csharp_namespace = "GrpcUkazka";
package objednavky;
service ObjednavkyService {
  rpc GetObjednavka (ObjednavkaRequest) returns (ObjednavkaResponse);
  rpc StreamObjednavky (StreamRequest) returns (stream ObjednavkaResponse);
}
message ObjednavkaRequest { int32 id = 1; }
message StreamRequest { int32 uzivatel_id = 1; }
message ObjednavkaResponse {
  int32 id = 1;
  string popis = 2;
  int64 castka_halere = 3;
  string mena = 4;
}
```

**Celý `GrpcUkazka.csproj`** pro společný kontrakt a server. Verze balíčků jsou připnuté kvůli opakovatelnému sestavení; novější vydání řady 2.x můžete dosadit po kontrole poznámek k vydání. `Grpc.Tools` není potřeba při běhu, proto `PrivateAssets=All`. `Both` generuje server i klienta pro tuto malou ukázku.

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Grpc.AspNetCore" Version="2.85.0"/>
    <PackageReference Include="Grpc.Net.Client" Version="2.85.0"/>
    <PackageReference Include="Grpc.Tools" Version="2.85.0" PrivateAssets="All"/>
    <Protobuf Include="Protos/objednavky.proto" GrpcServices="Both"/>
  </ItemGroup>
</Project>
```

### Server ASP.NET Core :id=server-aspnet-core

**Soubor `ObjednavkyGrpcService.cs`**; malá pevná data bez databáze. ID uživatele v požadavku je pouze demonstrační filtr; v provozu musí pocházet z ověřeného oprávnění. Autentizace této ukázce chybí záměrně, veřejné nasazení by ji muselo doplnit.

```csharp
using Grpc.Core;
using GrpcUkazka;
public sealed class ObjednavkyGrpcService : ObjednavkyService.ObjednavkyServiceBase
{
    private static ObjednavkaResponse Ukazka() => new()
    { Id = 42, Popis = "Kniha", CastkaHalere = 19990, Mena = "CZK" };
    public override Task<ObjednavkaResponse> GetObjednavka(ObjednavkaRequest request, ServerCallContext ctx)
    {
        ctx.CancellationToken.ThrowIfCancellationRequested();
        if (request.Id <= 0) throw new RpcException(new Status(StatusCode.InvalidArgument, "Neplatné ID."));
        if (request.Id != 42) throw new RpcException(new Status(StatusCode.NotFound, "Objednávka chybí."));
        return Task.FromResult(Ukazka());
    }
    public override async Task StreamObjednavky(StreamRequest request,
        IServerStreamWriter<ObjednavkaResponse> stream, ServerCallContext ctx)
    {
        if (request.UzivatelId <= 0)
            throw new RpcException(new Status(StatusCode.InvalidArgument, "Neplatný uživatel."));
        ctx.CancellationToken.ThrowIfCancellationRequested();
        if (request.UzivatelId == 1) await stream.WriteAsync(Ukazka());
    }
}
```

**Serverový `Program.cs`.** Pro obvyklý lokální HTTPS běh nastavte například `dotnet run --urls https://localhost:7001` s důvěryhodným vývojovým certifikátem (`dotnet dev-certs https --trust`).

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddGrpc();
var app = builder.Build();
app.MapGrpcService<ObjednavkyGrpcService>();
app.Run();
```

### Klient

**Alternativní `Program.cs`** v druhé kopii projektu se stejným `.proto` a csproj. Server musí běžet zvlášť; pro menší skutečný klientský projekt stačí odpovídající klientské balíčky včetně Google.Protobuf a generování `GrpcServices="Client"`.

```csharp
using Grpc.Core;
using Grpc.Net.Client;
using GrpcUkazka;
using var channel = GrpcChannel.ForAddress("https://localhost:7001");
var client = new ObjednavkyService.ObjednavkyServiceClient(channel);
using var limit = new CancellationTokenSource(TimeSpan.FromSeconds(5));
using var volani = client.GetObjednavkaAsync(new ObjednavkaRequest { Id = 42 },
    deadline: DateTime.UtcNow.AddSeconds(5), cancellationToken: limit.Token);
var odpoved = await volani.ResponseAsync;
Console.WriteLine($"{odpoved.Popis}: {odpoved.CastkaHalere} haléřů {odpoved.Mena}");
using var proud = client.StreamObjednavky(new StreamRequest { UzivatelId = 1 },
    deadline: DateTime.UtcNow.AddSeconds(5), cancellationToken: limit.Token);
await foreach (var o in proud.ResponseStream.ReadAllAsync(limit.Token))
    Console.WriteLine(o.Popis);
```

Výstup: `Kniha: 19990 haléřů CZK` a `Kniha`. Chybějící ID 43 skončí stavem `NotFound`, neplatné ID 0 stavem `InvalidArgument`; na klientovi chyby reprezentuje `RpcException`. Kanál lze dlouhodobě sdílet, jednotlivá volání a proudy uvolňujte.

## 3. Kdy použít

gRPC se hodí mezi službami s dohodnutým kontraktem nebo pro proudy zpráv. Prohlížeč nemůže běžně používat nativní gRPC protokol přímo; gRPC-Web potřebuje odpovídající serverovou podporu a má omezení některých proudových režimů. JSON/REST může být pro veřejné webové klienty jednodušší volba.

## 4. Časté chyby

- Chybějící `Protobuf` položka nebo generátor zanechá nedefinované C# typy i přes existující `.proto` soubor.
- HTTP/2 musí podporovat server i proxy. HTTPS jej obvykle vyjedná přes ALPN (Application-Layer Protocol Negotiation, volbu protokolu při navazování TLS); lokální cleartext test vyžaduje explicitně HTTP/2 endpoint. V provozu neodstraňujte TLS kvůli zprovoznění testu.
- Předávejte `ServerCallContext.CancellationToken` do skutečných databázových a dalších čekajících operací; deadline není příslib vrácení výsledku před koncem.
- Převod `decimal` na `double` může ztratit přesnost. Jednotku, měnu, rozsah a pravidla zaokrouhlení stanovte v kontraktu. [Generování a balíčky gRPC](https://learn.microsoft.com/en-us/aspnet/core/grpc/basics?view=aspnetcore-10.0).
