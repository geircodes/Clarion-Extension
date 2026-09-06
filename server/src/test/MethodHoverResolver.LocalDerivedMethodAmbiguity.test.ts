import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';

// Two adjacent procedures each declare their OWN procedure-local CLASS under the
// same name, each with its own method implementation placed immediately after its
// declaring procedure (the language's own placement rule for local/derived classes —
// see ScopeResolver.LocalDerivedMethod.test.ts's TWO_SAME_NAME fixture, reused here).
//
// Hovering the method DECLARATION inside ProcA's class must resolve to ProcA's own
// implementation (line 12), never ProcB's (line 24) and never "Implementation not
// found" — MethodHoverResolver.findMethodImplementationCrossFile matches purely by
// ClassName.MethodName text with no positional scoping, so on a real file where a
// bare-name-only search can genuinely turn up zero or the wrong candidate, only the
// declaringProcedureLine link (Issue #233 Rule 4) can disambiguate correctly.
//
//  0 PROGRAM
//  1   MAP
//  2   END
//  4 ProcA PROCEDURE
//  5 SharedName CLASS
//  6 Run PROCEDURE
//  7   END
//  8 AVar LONG
//  9   CODE
// 10   AVar = 1
// 12 SharedName.Run PROCEDURE
// 13   CODE
// 14   AVar = 2
// 16 ProcB PROCEDURE
// 17 SharedName CLASS
// 18 Run PROCEDURE
// 19   END
// 20 BVar LONG
// 21   CODE
// 22   BVar = 1
// 24 SharedName.Run PROCEDURE
// 25   CODE
// 26   BVar = 2
const TWO_SAME_NAME = [
    'PROGRAM',
    '  MAP',
    '  END',
    '',
    'ProcA PROCEDURE',
    'SharedName CLASS',
    'Run PROCEDURE',
    '  END',
    'AVar LONG',
    '  CODE',
    '  AVar = 1',
    '',
    'SharedName.Run PROCEDURE',
    '  CODE',
    '  AVar = 2',
    '',
    'ProcB PROCEDURE',
    'SharedName CLASS',
    'Run PROCEDURE',
    '  END',
    'BVar LONG',
    '  CODE',
    '  BVar = 1',
    '',
    'SharedName.Run PROCEDURE',
    '  CODE',
    '  BVar = 2',
    ''
].join('\n');

suite('MethodHoverResolver — local derived method declaration hover, same class name reused across procedures', () => {
    let provider: HoverProvider;
    let tokenCache: TokenCache;

    setup(() => {
        provider = new HoverProvider();
        tokenCache = TokenCache.getInstance();
        tokenCache.clearAllTokens();
    });

    teardown(() => {
        tokenCache.clearAllTokens();
    });

    function hoverText(hover: any): string {
        if (!hover) return '';
        return typeof hover.contents === 'string'
            ? hover.contents
            : 'value' in hover.contents ? hover.contents.value : '';
    }

    test('hovering the method declaration in ProcA\'s class resolves to ProcA\'s own implementation, not ProcB\'s and not "not found"', async () => {
        const doc = TextDocument.create('test://two-same-name-a.clw', 'clarion', 1, TWO_SAME_NAME);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(6, 0)); // "Run" inside ProcA's SharedName CLASS
        const content = hoverText(hover);

        assert.ok(!content.includes('Implementation not found'),
            `should resolve an implementation; got: ${content}`);
        assert.ok(content.includes(':13'),
            `should resolve to ProcA's own implementation at line 13 (1-based); got: ${content}`);
        assert.ok(!content.includes(':25'),
            `must NOT resolve to ProcB's implementation at line 25; got: ${content}`);
    });

    test('hovering the method declaration in ProcB\'s class resolves to ProcB\'s own implementation, not ProcA\'s', async () => {
        const doc = TextDocument.create('test://two-same-name-b.clw', 'clarion', 1, TWO_SAME_NAME);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(18, 0)); // "Run" inside ProcB's SharedName CLASS
        const content = hoverText(hover);

        assert.ok(!content.includes('Implementation not found'),
            `should resolve an implementation; got: ${content}`);
        assert.ok(content.includes(':25'),
            `should resolve to ProcB's own implementation at line 25 (1-based); got: ${content}`);
        assert.ok(!content.includes(':13'),
            `must NOT resolve to ProcA's implementation at line 13; got: ${content}`);
    });
});
