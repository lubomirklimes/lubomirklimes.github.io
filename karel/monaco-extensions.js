// Karel language registration for Monaco Editor.
// Called from KarelEditor.razor via JS interop once the editor is initialised.
window.registerKarelLanguage = function () {

    // Guard: skip if already registered (hot-reload / multiple editors).
    if (monaco.languages.getLanguages().some(l => l.id === 'karel')) return;

    // ── Language registration ─────────────────────────────────────────────────
    monaco.languages.register({ id: 'karel' });

    // ── Monarch tokeniser ─────────────────────────────────────────────────────
    monaco.languages.setMonarchTokensProvider('karel', {
        ignoreCase: true,           // Karel keywords are case-insensitive

        keywords: [
            'KROK', 'VLEVO', 'VPRAVO', 'POLOZ', 'ZVEDNI',
            'OPAKUJ', 'POKUD', 'JINAK', 'DOKUD',
            'PROCEDURA', 'KAREL', 'START', 'STOP'
        ],

        // Condition identifiers used inside ( … )
        conditions: [
            'VOLNO', 'ZED', 'NE_VOLNO', 'NE_ZED',
            'ZNACKA', 'MA_ZNACKY', 'NE_ZNACKA', 'NE_MA_ZNACKY',
            'DOMA', 'NE_DOMA',
            'SEVER', 'JIH', 'VYCHOD', 'ZAPAD',
            'NE_SEVER', 'NE_JIH', 'NE_VYCHOD', 'NE_ZAPAD'
        ],

        tokenizer: {
            root: [
                // Line comments: // …
                [/\/\/.*$/, 'comment'],

                // Integer literals
                [/\d+/, 'number'],

                // Braces and parentheses
                [/[{}]/, 'delimiter.curly'],
                [/[()]/, 'delimiter.paren'],

                // Identifiers, keywords, condition names
                [/[A-Za-z_][A-Za-z0-9_]*/, {
                    cases: {
                        '@keywords':   'keyword',
                        '@conditions': 'karel-condition',
                        '@default':    'identifier'
                    }
                }],

                // Whitespace (skip)
                [/\s+/, 'white'],
            ]
        }
    });

    // ── Theme ─────────────────────────────────────────────────────────────────
    monaco.editor.defineTheme('karel-light', {
        base: 'vs',
        inherit: true,          // keep VS defaults for everything not listed below
        rules: [
            { token: 'keyword',          foreground: '0000CC', fontStyle: 'bold'   },
            { token: 'karel-condition',  foreground: '007700'                      },
            { token: 'identifier',       foreground: '6F3800'                      },
            { token: 'number',           foreground: 'C06000'                      },
            { token: 'comment',          foreground: '7A7A7A', fontStyle: 'italic' },
            { token: 'delimiter.curly',  foreground: '444444', fontStyle: 'bold'   },
            { token: 'delimiter.paren',  foreground: '444444'                      },
        ],
        colors: {}
    });

    monaco.editor.setTheme('karel-light');
};
