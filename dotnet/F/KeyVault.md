# Azure Key Vault

Key Vault ukládá tajné hodnoty, kryptografické klíče a certifikáty. Jsou to odlišné typy objektů a operací. Spravovaná identita (Managed Identity) řeší přihlášení aplikace bez jejího vlastního hesla; co smí identita dělat, určuje RBAC (Role-Based Access Control, řízení přístupu podle přidělených rolí). Příklady cílí na .NET 10; balíčky Azure SDK mají vlastní číslování verzí.

## 1. Princip :id=_1-koncept

Identitě přidělte nejmenší potřebný rozsah. Role **Key Vault Secrets User** umožňuje čtení tajemství, ne jejich libovolný zápis; správce tajemství potřebuje jinou roli. RBAC je doporučený model pro nové trezory; starší model access policies stále funguje, jeho budoucí změny sledujte v dokumentaci Azure.

Operace nad obsahem trezoru se sledují přes nastavené diagnostické logy, například AuditEvent. Běžný Azure Activity Log zaznamenává operace správy prostředku, ne jednotlivá čtení tajemství. [Logování Key Vault](https://learn.microsoft.com/en-us/azure/key-vault/general/logging).

## 2. Příklad

<span id="načtení-tajných-hodnot-přes-configuration-provider"></span>

### Načtení přes konfigurační provider

**Fragment** před `Build()` ve webovém `Program.cs`, balíčky Azure.Identity a Azure.Extensions.AspNetCore.Configuration.Secrets. Předpokládá existující trezor, identitu a oprávnění.

```csharp
using Azure.Identity;
using Azure.Extensions.AspNetCore.Configuration.Secrets;
if (!builder.Environment.IsDevelopment())
{
    string uri = builder.Configuration["KeyVault:Uri"]
        ?? throw new InvalidOperationException("Chybí URI trezoru.");
    builder.Configuration.AddAzureKeyVault(new Uri(uri), new ManagedIdentityCredential(),
        new AzureKeyVaultConfigurationOptions { ReloadInterval = TimeSpan.FromMinutes(5) });
}
```

Pět minut je zde zvolený interval obnovy, nikoli okamžitá rotace. Název `ConnectionStrings--Default` provider mapuje na `ConnectionStrings:Default`; Key Vault nepovoluje dvojtečku v názvu tajné hodnoty. Hodnoty nepřepisujte zpět do veřejného JSON. Místně lze používat User Secrets (nejsou šifrovaným trezorem) nebo vědomě vybranou vývojovou identitu. [Provider a obnova](https://learn.microsoft.com/en-us/aspnet/core/security/key-vault-configuration?view=aspnetcore-10.0).

<span id="ruční-přístup-k-tajné-hodnotě"></span>

### Přímé čtení tajné hodnoty

**Metoda** v serverové třídě s balíčkem Azure.Security.KeyVault.Secrets. Sdílený klient a token přicházejí od hostitele; skutečná hodnota se nepíše na konzoli ani do logu.

```csharp
using Azure.Security.KeyVault.Secrets;
public static async Task PouzijAsync(SecretClient client,
    Func<string, CancellationToken, Task> operace, CancellationToken ct)
{
    var response = await client.GetSecretAsync("DbPassword", cancellationToken: ct);
    await operace(response.Value.Value, ct);
}
```

Tento callback ukazuje předání závislosti, ne hotové databázové přihlášení. Verzi a dobu života v paměti navrhněte podle použití. Samotný SecretClient neznamená automatickou trvalou cache hodnot; opakované čtení může být další síťový požadavek.

<span id="přiřazení-rbac-role-přes-cli"></span>

### Oprávnění a ověření identity

Zapněte systémovou či uživatelskou identitu aplikace a přidělte jí čtecí datovou roli na zvoleném trezoru. Změna role je privilegovaná operace správce; není potřeba dávat aplikaci právo měnit role. Ověřte rovněž síťový přístup a DNS, jinak samotná role nestačí.

**Bash pro správce** s oprávněním přidělovat role. Proměnné `APP`, `RG` a `VAULT` označují vaši aplikaci, skupinu prostředků a trezor. První příkaz zjistí ID již zapnuté identity aplikace, druhý jí přidělí čtecí roli jen na tomto trezoru.

```bash
PRINCIPAL=$(az webapp identity show --name "$APP" --resource-group "$RG" --query principalId --output tsv)
az role assignment create --assignee-object-id "$PRINCIPAL" --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" --scope "$(az keyvault show --name "$VAULT" --query id --output tsv)"
```

Přidělení role se může projevit s několikaminutovým zpožděním.

<span id="certifikát-z-key-vault-pro-https"></span>

### Certifikáty a HTTPS

Správa certifikátu v Key Vault není automatická konfigurace HTTPS hostitele. Import/reference certifikátu v App Service má vlastní podmínky a oprávnění; samotné čtení tajemství nezaručuje dostupnost privátního klíče ani správnou obnovu vazby.

## 3. Kdy použít

Trezor je vhodný pro centralizovaná tajemství a auditovatelný přístup; podle platformy existují i jiné spravované zdroje. Je-li podporována bezheslová identita pro databázi či Storage, nemusíte pro ni vůbec ukládat statické heslo do trezoru.

Rotace obecného secretu se neděje magicky: musí se změnit i cílový systém a aplikace musí načíst novou hodnotu. Kryptografické klíče a certifikáty mají jiné možnosti rotačních politik. Zohledněte cache provideru, IOptions a dlouho žijící klienty vytvořené se starou hodnotou.

## 4. Časté chyby

- Vypsat `secret.Value` pro ověření funkčnosti; log je pak další úložiště tajemství.
- Přidat čtecí roli a volat `SetSecret`; čtecí role zápis nepovoluje a aplikace, která tajemství jen čte, zápis nepotřebuje.
- Očekávat okamžitou obnovu konfigurace bez nastavení a bez reakce aplikace na změnu.
- Použít produkční administrátorské přihlášení jako pohodlnou vývojovou závislost; oddělte identity a oprávnění.
