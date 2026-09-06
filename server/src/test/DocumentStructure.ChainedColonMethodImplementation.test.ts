import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { Token, TokenType } from '../tokenizer/TokenTypes';

/**
 * A procedure-local CLASS whose method name is itself a chained colon-qualified
 * identifier with MORE THAN ONE colon (e.g. `My:My:Method`) is misclassified when
 * IMPLEMENTED — `ClassName.My:My:Method PROCEDURE()` — as an ordinary global procedure
 * named just the last identifier segment, rather than as that class's method
 * implementation.
 *
 * Root cause: `StructurePrefix`'s pattern (TokenPatterns.ts) captures only ONE colon
 * segment ("Prefix:Field"). For `My:My:Method` it grabs `My:My` and strands the second
 * colon as a bare `Delimiter` token. DocumentStructure.handleProcedureToken's backward
 * walk (reconstructing the qualified name before a PROCEDURE keyword) stops at the
 * first token whose type isn't Label/Variable/Attribute — so it stops at that stray
 * Delimiter and never sees the class name at all.
 *
 * The SAME identifier as a bare DECLARATION (no preceding "ClassName." to confuse the
 * walk) tokenizes correctly as one Label — this bug is specific to the *implementation*
 * line's backward-reconstruction.
 *
 * Note: this bug predates and is independent of the local-derived-method hover fix
 * (declaringProcedureLine / Issue #233 Rule 4) — it was masked there by a name-only
 * text-based fallback search that doesn't depend on correct tokenization. Once that
 * fallback is removed for a registered local class (as that fix does), a class using
 * this naming shape loses ITS masking too, which is how this was found.
 */
function createTestDocument(content: string, uri: string = 'file:///chained-colon-method.clw'): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

function build(content: string): Token[] {
    const cache = TokenCache.getInstance();
    cache.clearAllTokens();
    return cache.getTokens(createTestDocument(content));
}

// 0 PROGRAM
// 1   MAP
// 2   END
// 4 Caller PROCEDURE()
// 6 MyOwn1:CLASS CLASS
// 7 My:My:Method  PROCEDURE(), LONG
// 8       END
// 10   CODE
// 11   MyOwn1:CLASS.My:My:Method()
// 12   RETURN
// 14 MyOwn1:CLASS.My:My:Method PROCEDURE()
// 15   CODE
// 16   RETURN(1)
const CHAINED_COLON_METHOD = [
    'PROGRAM',
    '  MAP',
    '  END',
    '',
    'Caller PROCEDURE()',
    '',
    'MyOwn1:CLASS CLASS',
    'My:My:Method  PROCEDURE(), LONG',
    '      END',
    '',
    '  CODE',
    '  MyOwn1:CLASS.My:My:Method()',
    '  RETURN',
    '',
    'MyOwn1:CLASS.My:My:Method PROCEDURE()',
    '  CODE',
    '  RETURN(1)',
    ''
].join('\n');

suite('DocumentStructure — chained colon-qualified method implementation name', () => {
    test('the implementation line is tagged MethodImplementation with the full qualified label', () => {
        const tokens = build(CHAINED_COLON_METHOD);

        const implToken = tokens.find(t => t.line === 14 && t.type === TokenType.Procedure);
        assert.ok(implToken, 'expected a Procedure token on the implementation line');
        assert.strictEqual(implToken!.subType, TokenType.MethodImplementation,
            `expected MethodImplementation, got ${implToken!.subType === TokenType.GlobalProcedure ? 'GlobalProcedure' : implToken!.subType}`);
        assert.strictEqual(implToken!.label, 'MyOwn1:CLASS.My:My:Method');
    });

    test('declaringProcedureLine still links the implementation to its declaring procedure once classified correctly', () => {
        const tokens = build(CHAINED_COLON_METHOD);

        const implToken = tokens.find(t =>
            t.subType === TokenType.MethodImplementation &&
            t.label?.toUpperCase() === 'MYOWN1:CLASS.MY:MY:METHOD');
        assert.ok(implToken, 'expected the implementation to be registered as a MethodImplementation token');

        const declaringProc = tokens.find(t => t.subType === TokenType.GlobalProcedure && t.label === 'Caller');
        assert.ok(declaringProc, 'expected the declaring procedure token');
        assert.strictEqual(implToken!.declaringProcedureLine, declaringProc!.line);
    });
});
