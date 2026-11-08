# Azure App Service

App Service je PaaS (spravovaná aplikační platforma) pro weby a API. Provozovatel stále odpovídá za kód, konfiguraci, data a přístupová práva. Příklady cílí na .NET 10 / C# 14; nabídku runtime, plánů a regionů si ověřte v Azure pro svůj region.

## 1. Princip :id=_1-koncept

App Service Plan určuje výpočetní prostředky a OS, více aplikací může sdílet jeho kapacitu. Počet instancí, autoscale a provozní funkce závisejí na plánu. Deployment slot je samostatně běžící varianta aplikace se svou adresou; sloty podporují plány **Standard, Premium a Isolated**, plány Basic je nemají ([podmínky slotů](https://learn.microsoft.com/en-us/azure/app-service/deploy-staging-slots)).

Spravovaná identita (Managed Identity) dovoluje získat přístupový token bez hesla v kódu, ale sama neuděluje oprávnění k databázi nebo Key Vaultu.

## 2. Příklad

### Nasazení přes Azure CLI

**Postup pro neprodukční aplikaci.** Nejprve místní sestavení a zabalení v PowerShellu, spuštěné v adresáři vašeho projektu:

```powershell
dotnet publish ./MojeApp.csproj -c Release -o ./publish
Compress-Archive -Path ./publish/* -DestinationPath ./app.zip
```

Potom nasazení přes Azure CLI. **Vyžaduje přihlášení `az login` a předplatné; příkazy vytvářejí zpoplatněné prostředky**, proto před vytvořením plánu posuďte jeho cenu a funkce. Proměnné `RG`, `PLAN` a `APP` zvolte sami; název aplikace musí být v Azure jedinečný.

```bash
az webapp list-runtimes --os linux --output table
az group create --name "$RG" --location westeurope
az appservice plan create --name "$PLAN" --resource-group "$RG" --is-linux --sku S1
az webapp create --name "$APP" --resource-group "$RG" --plan "$PLAN" --runtime "DOTNETCORE:10.0"
az webapp deploy --name "$APP" --resource-group "$RG" --src-path ./app.zip --type zip
```

Přesný zápis runtime převezměte z výstupu `list-runtimes`; musí odpovídat cílovému frameworku a OS aplikace (pro projekt `net10.0` tedy .NET 10, ne starší `DOTNETCORE:8.0`). Plán `S1` zvolený kvůli slotům níže je placený; pro první pokus bez slotů stačí levnější úroveň.

### Deployment slot a prohození verzí :id=deployment-slot-blue-green

**Bash pro oprávněného operátora** s existující aplikací v plánu Standard nebo vyšším. Vytvoří slot `staging`, nasadí do něj balíček a po kontrole jej prohodí s produkcí. **Poslední příkaz přepne produkční provoz.**

```bash
az webapp deployment slot create --name "$APP" --resource-group "$RG" --slot staging
az webapp deploy --name "$APP" --resource-group "$RG" --slot staging --src-path ./app.zip --type zip
az webapp deployment slot list --name "$APP" --resource-group "$RG" --output table
az webapp deployment slot swap --name "$APP" --resource-group "$RG" --slot staging --target-slot production
```

Před přesunem provozu nasaďte do slotu, proveďte kontrolu zdraví a ověřte konfiguraci. Hodnoty vázané na prostředí označte jako slot settings. Swap kódu nevrací nekompatibilní databázovou migraci ani externí změny; plán návratu musí zahrnovat i data. Ne všechny konfigurace a identity se při swapu mění stejným způsobem.

<span id="managed-identity-key-vault-v-kódu"></span>

### Spravovaná identita a Key Vault

**Fragment** před `Build()` ve webovém projektu s balíčky `Azure.Identity` a `Azure.Extensions.AspNetCore.Configuration.Secrets`. Předpokládá, že aplikace má zapnutou systémovou identitu, Key Vault URI v konfiguraci a potřebnou datovou roli pro čtení tajemství.

```csharp
using Azure.Identity;
string vaultUri = builder.Configuration["KeyVault:Uri"]
    ?? throw new InvalidOperationException("Chybí URI trezoru.");
builder.Configuration.AddAzureKeyVault(new Uri(vaultUri), new ManagedIdentityCredential());
```

`ManagedIdentityCredential` je zde záměrně pro Azure hostitele; místní vývoj potřebuje jiný zdroj přihlášení nebo User Secrets. Postup obnovy a oprávnění viz [Key Vault](KeyVault.md).

### Konfigurace aplikačních nastavení :id=konfigurace-application-settings

App settings se poskytují jako proměnné prostředí a přepisují odpovídající výchozí JSON hodnoty hostitele; nejsou obecně silnější než každý později přidaný provider nebo argument příkazové řádky. Dvojité podtržítko mapuje sekci, například `KeyVault__Uri` na `KeyVault:Uri`. Do běžných konfiguračních souborů neukládejte skutečná hesla. Key Vault reference v nastavení App Service a načítání providerem v kódu jsou dva odlišné mechanismy.

## 3. Kdy použít

App Service je vhodný pro spravovaný web, pokud vyhovuje jeho model škálování a sítě. Pro jiné provozní požadavky porovnejte Container Apps nebo Kubernetes. VNet integrace a Private Endpoint mají odlišný směr síťového přístupu; jejich dostupnost ověřte pro konkrétní plán.

## 4. Časté chyby

- Vybrat Basic plán a předpokládat sloty nebo všechny možnosti autoscale.
- Považovat Always On za automatickou vlastnost každého placeného plánu; ověřte podporu a skutečné nastavení podle provozu.
- Sdílet stav relace jen v paměti instance. Affinity může některé požadavky držet u jednoho serveru, neochrání však stav před restartem; zvažte externí úložiště.
- Zaměnit úspěšný upload balíčku za zdravou aplikaci. Ověřte start, port a funkční požadavek bez zveřejnění tajných údajů.
