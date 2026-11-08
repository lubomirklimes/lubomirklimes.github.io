# Úvod do programování a C#

**Příklady:** .NET 10 / C# 14, `dotnet new console -f net10.0`. Každý blok C# je samostatný `Program.cs` pro `dotnet run`, pokud není označen jiný kontext. Bloky nespojujte.

## Co je programování?

Program je přesný postup zapsaný pro počítač. Příkazy zpracovávají vstupy, mění stav a vytvářejí výstup; neošetřená situace může běh přerušit.

## Co je C#?

C# (čte se „sí šarp“) je jazyk pro webové a desktopové aplikace, služby i hry. **.NET** poskytuje běhové prostředí a knihovny. Dostupná verze jazyka a runtime závisí na cílové platformě; příklady v této příručce cílí na .NET 10.

<span id="co-budeš-potřebovat"></span>

## Co je potřeba?

| Nástroj | Účel |
|---|---|
|[.NET SDK](https://dotnet.microsoft.com/download)|Vývojová sada: kompilátor, práce s projekty a odpovídající runtime. Pro příklady zvolte SDK 10.|
|[Visual Studio](https://visualstudio.microsoft.com/)|Editor a ladění; ověřte podporu zvoleného SDK.|
|[VS Code](https://code.visualstudio.com/)|Lehčí editor; projekt lze spouštět z terminálu.|

Samotný runtime nestačí k sestavení zdrojového kódu. Ověřte SDK:

```powershell
dotnet --list-sdks
```

<span id="první-program-hello-world"></span>

## První program

V nové pracovní složce spusťte:

```powershell
dotnet new console -f net10.0 -n PrvniProgram
cd PrvniProgram
dotnet run
```

Nahraďte `Program.cs` a znovu spusťte `dotnet run`:

```csharp
Console.WriteLine("Ahoj, světe!");
```

Výstup je `Ahoj, světe!`. V podporovaném IDE lze použít jeho příkaz pro spuštění či ladění; klávesová zkratka závisí na nastavení.

<details>
<summary>Volitelné podrobnosti: Explicitní vstupní bod</summary>

Stejný program lze napsat s metodou `Main`; tento zápis zůstává platný:

```csharp
using System;
class Program
{
    static void Main()
    {
        Console.WriteLine("Ahoj, světe!");
    }
}
```

`using System` zpřístupní jména z oboru názvů `System`; samo nic nespouští. Příkazy nejvyšší úrovně z prvního příkladu kompilátor vloží do vygenerovaného vstupního bodu. Soubor tedy nemusí obsahovat explicitní deklaraci třídy. Moderní šablona zapíná běžné `using` direktivy implicitně.

</details>
