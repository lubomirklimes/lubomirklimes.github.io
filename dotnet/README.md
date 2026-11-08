# DotNet

## A. Jazyk C# od začátku

-   [Úvod do programování a C#](A/Intro.md)
-   [Základní pojmy v C#](A/Concepts.md)
-   [Podmínky a rozhodování](A/Branching.md)
-   [Smyčky a opakování](A/Loops.md)
-   [Funkce a metody](A/Methods.md)
-   [Pole a seznamy](A/Lists.md)
-   [Objektově orientované programování (OOP)](A/OOP.md)

## B. Moderní C# a .NET runtime

-   [Výčtové typy (enum)](B/Enum.md)
-   [Struktury (struct) a rozdíl oproti třídám](B/Struct.md)
-   [Záznamy (record) – Immutabilní datové typy](B/Record.md)
-   [Anonymní typy a Tuples](B/Anonymni_typy_tuple.md)
-   [Delegáty a události (delegate, event)](B/Delegate_event.md)
-   [Výrazy LINQ a zpracování kolekcí](B/LINQ.md)
-   [Generics – generické typy a metody](B/Generics.md)
-   [Nullable reference types](B/Nullable.md)
-   [Pattern matching](B/PatternMatching.md)
-   [Extension methods](B/ExtensionMethods.md)
-   [Iterátory a yield return](B/Iterators.md)
-   [Async/await – základy](B/Async_await.md)
-   [CLR, sestavení a přehled runtime](B/CLR_overview.md)

## C. Základní API a architektura aplikací

-   [Práce se soubory a adresáři](C/File_IO.md)
-   [Práce s datem a časem](C/DateTime.md)
-   [Základní kolekce a jejich použití](C/Collections.md)
-   [Řetězce a jejich zpracování](C/Strings.md)
-   [Výjimky a jejich ošetření](C/Exceptions.md)
-   [Logování a diagnostika](C/Logging.md)
-   [Základy práce se sítí](C/Networking.md)
-   [Serializace a deserializace](C/Serialization.md)
-   [Dependency Injection a práce se službami](C/DependencyInjection.md)
-   [Konfigurace aplikace (appsettings, IOptions)](C/Configuration.md)
-   [Background services a hosted services](C/BackgroundServices.md)

## D. Desktop a mobilní aplikace

-   [Windows Forms (WinForms)](D/WinForms.md)
-   [WPF (Windows Presentation Foundation)](D/WPF.md)
-   [MAUI – multiplatformní desktopové aplikace](D/MAUI.md)
-   [Migrace z Xamarin na .NET MAUI](D/Xamarin_migrace.md)
-   [Práce s GPS, senzory a notifikacemi](D/Mobile_Features.md)

## E. Webové aplikace a API

-   [ASP.NET Core MVC – klasický web](E/ASP_NET_MVC.md)
-   [Razor Pages](E/RazorPages.md)
-   [Blazor – moderní webová aplikace v C#](E/Blazor.md)
-   [Minimal APIs – nejjednodušší způsob, jak vytvořit API](E/MinimalAPI.md)
-   [REST API – konvence, HttpClient, verzování](E/REST_API.md)
-   [Middleware a pipeline v ASP.NET Core](E/Middleware.md)
-   [Autentizace a autorizace](E/Auth.md)
-   [OpenAPI a Swagger](E/OpenAPI.md)
-   [SignalR – real-time komunikace](E/SignalR.md)
-   [gRPC v .NET](E/gRPC.md)

## F. Cloud, kontejnery a distribuované systémy

-   [Docker a Kubernetes v .NET](F/Docker_Kubernetes.md)
-   [Azure App Service](F/Azure_AppService.md)
-   [Azure Functions a Serverless vývoj](F/Azure_Functions.md)
-   [Práce s databázemi v cloudu (SQL, NoSQL)](F/Cloud_Databases.md)
-   [Azure Storage – Blob, Queue, Table](F/Azure_Storage.md)
-   [Messaging a fronty (Service Bus, RabbitMQ)](F/Messaging.md)
-   [Správa tajných klíčů (Key Vault, Managed Identity)](F/KeyVault.md)
-   [CI/CD pro .NET aplikace](F/CICD.md)
-   [Observability – logy, metriky, tracing, OpenTelemetry](F/Observability.md)

## G. Specifické oblasti

-   [Unity a C# – herní engine](G/Unity.md)
-   [MonoGame – alternativa k Unity](G/MonoGame.md)
-   [Práce s fyzikou a kolizemi](G/GamePhysics.md)
-   [CLI nástroje v .NET](G/CLI.md)
-   [IoT a embedded s .NET](G/IoT.md)
-   [AI a ML.NET](G/ML_NET.md)

## H. Výkon, async a paralelismus

### Výkonové optimalizace

-   [Techniky pro profilování aplikací .NET](H/Profilovani_aplikaci.md)
-   [Benchmarking s BenchmarkDotNet](H/Benchmarking.md)
-   [Minimalizace doby startu aplikací a warm-up](H/Minimalizace_doby_startu_aplikace.md)
-   [JIT (Just-In-Time) vs AOT (Ahead-Of-Time) kompilace](H/JIT_AOT.md)
-   [Optimalizace práce s I/O (souborový systém, síťové operace)](H/Optimalizace_IO.md)
-   [Cache a vyrovnávací paměť (caching strategies)](H/Cache.md)
-   [Správa paměti a Garbage Collection](H/Sprava_pameti.md)
-   [Span\<T\> a Memory\<T\> – zero-copy práce s pamětí](H/Span_Memory.md)
-   [Optimalizace alokace paměti pomocí ArrayPool\<T\>](H/ArrayPool.md)
-   [Optimalizace stringů a práce s UTF-8](H/Stringy_utf8.md)
-   [ref struct a readonly struct](H/Ref_Readonly_Struct.md)
-   [Minimalizace přepínání vláken a ThreadPool tuning](H/Prepinani_vlaken.md)

### Asynchronní programování a paralelní zpracování

-   [Pokročilé techniky s async a await](H/Async_await_pokrocile.md)
-   [Správné použití Task a ValueTask](H/Task_ValueTask.md)
-   [CancellationToken a řízení zrušení úloh](H/CancellationToken.md)
-   [ConfigureAwait a synchronizační kontext](H/ConfigureAwait.md)
-   [Orchestrace úloh: Task.WhenAll, Task.WhenAny a timeouty](H/Task_Orchestration.md)
-   [IAsyncEnumerable a asynchronní streamování dat](H/IAsyncEnumerable.md)
-   [TaskCompletionSource – pokročilé použití](H/TaskCompletionSource.md)
-   [Interakce mezi asynchronním a synchronním kódem](H/Async_Sync_Interop.md)
-   [Parallel.ForEachAsync – asynchronní paralelní zpracování kolekcí](H/Parallel_ForEachAsync.md)
-   [TPL a PLINQ – paralelní zpracování CPU-bound úloh](H/TPL_PLINQ.md)
-   [System.Threading.Channels – producent-konzument pipeline](H/Paralelni_zpracovani_Channels.md)
-   [Paralelní kolekce – BlockingCollection a producent-konzument vzor](H/Paralelni_kolekce_blokujici.md)
-   [Paralelní kolekce – ConcurrentQueue, ConcurrentDictionary a další](H/Paralelni_kolekce_concurrent.md)