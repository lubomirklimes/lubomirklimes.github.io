# CI/CD pro .NET (GitHub Actions, Azure DevOps)

CI je průběžné sestavování a testování změn. Continuous Delivery připravuje vydatelný artefakt s rozhodnutím o vydání, Continuous Deployment vydává automaticky po splnění pravidel. Automatizace chyby sama nevylučuje; rozhoduje obsah testů, oprávnění a kontrola nasazení.

## 1. Princip :id=_1-koncept

Oddělte nedůvěryhodný PR od nasazovací úlohy s oprávněními. Sestavte a otestujte konkrétní revizi, publikujte artefakt a nasazujte právě tento artefakt. OIDC (OpenID Connect) umožňuje krátkodobé federované přihlášení běhového agenta (runneru) bez dlouhodobého publish profile; Azure musí předem důvěřovat přesně vymezenému repozitáři/prostředí.

## 2. Příklad

<span id="github-actions-build-a-nasazení-na-azure-app-service"></span>

### GitHub Actions – sestavení a oddělené nasazení

**Soubor `.github/workflows/dotnet.yml`** ve vašem aplikačním repozitáři. Předpokládá `MojeApp.sln`, `src/MojeApp/MojeApp.csproj`, skutečný testovací projekt v solution, existující App Service staging slot a nastavenou OIDC identitu.

```yaml
name: Ověření a vydání .NET
'on':
  push:
    branches: [main]
  pull_request:
    branches: [main]
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-dotnet@v6
        with:
          dotnet-version: '10.0.x'
      - name: Obnovit závislosti
        run: dotnet restore MojeApp.sln
      - name: Sestavit
        run: dotnet build MojeApp.sln -c Release --no-restore
      - name: Otestovat
        run: dotnet test MojeApp.sln -c Release --no-build --logger trx --results-directory ./test-results
      - name: Uchovat výsledky testů
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: test-results
          path: test-results/
      - name: Připravit aplikaci
        run: dotnet publish src/MojeApp/MojeApp.csproj -c Release --no-build -o ./publish
      - uses: actions/upload-artifact@v7
        with:
          name: aplikace
          path: publish/
          if-no-files-found: error
  deploy:
    needs: build
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: staging
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/download-artifact@v8
        with:
          name: aplikace
          path: publish/
      - uses: azure/login@v3
        with:
          client-id: ${{ vars.AZURE_CLIENT_ID }}
          tenant-id: ${{ vars.AZURE_TENANT_ID }}
          subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}
      - uses: azure/webapps-deploy@v3
        with:
          app-name: ${{ vars.AZURE_WEBAPP_NAME }}
          slot-name: staging
          package: publish/
```

PR nemá nasazovací úlohu ani `id-token:write`. `needs` vyžaduje úspěšné sestavení/testy; pouze upload testových výsledků běží i po chybě. Nenulový exit `dotnet test` sám označí krok jako neúspěšný, absence TRX reportu z něj nedělá zelený běh. Pokud solution neobsahuje skutečné testy, zelená neznamená otestováno.

Prostředí `staging` musí mít zvlášť nastavená schvalovací pravidla a omezené federované oprávnění; samotný název je nevytvoří. Zabraňte souběžným konfliktním vydáním podle své strategie. Ukázka nekoná produkční swap ani smoke test; ty přidejte až po kontrole slotu. Akce jsou odkazované hlavní verzí (například `@v7`), která se posouvá s opravami; pro řízený provoz připněte zkontrolované commit SHA a aktualizujte je. `10.0.x` vybírá patch řadu, pro přesně opakovatelné SDK použijte global.json.

### Azure DevOps – sestavení artefaktu :id=azure-devops-pipeline-azure-pipelinesyml

**Soubor `azure-pipelines.yml`** pro stejné aplikační cesty a Linux agenta. Jde jen o CI; release stage a service connection pro nasazení nejsou součástí výřezu.

```yaml
trigger:
  branches:
    include: [main]
pool:
  vmImage: ubuntu-latest
steps:
  - task: UseDotNet@2
    inputs:
      packageType: sdk
      version: '10.0.x'
  - script: dotnet restore MojeApp.sln
    displayName: Obnovit závislosti
  - script: dotnet build MojeApp.sln -c Release --no-restore
    displayName: Sestavit
  - script: dotnet test MojeApp.sln -c Release --no-build --logger trx --results-directory test-results
    displayName: Otestovat
  - task: PublishTestResults@2
    condition: succeededOrFailed()
    inputs:
      testResultsFormat: VSTest
      testResultsFiles: 'test-results/*.trx'
  - script: dotnet publish src/MojeApp/MojeApp.csproj -c Release --no-build -o $(Build.ArtifactStagingDirectory)/app
    displayName: Připravit aplikaci
  - task: PublishPipelineArtifact@1
    inputs:
      targetPath: $(Build.ArtifactStagingDirectory)/app
      artifact: aplikace
```

Spouštění pro PR v Azure DevOps závisí také na poskytovateli repozitáře a branch policies; tento YAML jej výslovně nenastavuje. Publikuje-li krok pro jiný cíl nebo RID (Runtime Identifier, například `linux-x64`), než pro jaký se sestavovalo, nelze použít `publish --no-build`; parametry kroků musí souhlasit.

## 3. Kdy použít

CI pomáhá u každé pravidelně měněné aplikace. Nasazování vyžaduje navíc minimální oprávnění, řízený artefakt a plán návratu včetně databázového schématu. Nevydávejte neověřený kód z `pull_request_target` s přístupem k tajemstvím. [OIDC a App Service](https://learn.microsoft.com/en-us/azure/app-service/deploy-github-actions?tabs=openid,aspnetcore).

## 4. Časté chyby

- Jeden krok s Azure přihlášením pro všechny PR i push bez podmínky.
- `continue-on-error` kolem povinných testů nebo další shellový příkaz, který skryje jejich exit code.
- Přidělit OIDC oprávnění celému workflow, přestože je potřebuje jen deployment job.
- Zaměnit slot swap za záruku kompatibility dat a nulového výpadku celé aplikace.
