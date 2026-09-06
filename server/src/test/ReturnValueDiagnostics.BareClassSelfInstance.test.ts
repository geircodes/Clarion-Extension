/**
 * validateDiscardedReturnValues — bare local CLASS self-instance receiver.
 *
 * `Label CLASS ... END` with no `,TYPE` and no separate instance variable — the
 * label doubles as both the class and its single instance, exactly like a bare
 * `Label QUEUE/GROUP/FILE ... END` local. The compiler warns "Calling function
 * as procedure" on a discarded non-PROC return through this receiver just like
 * any other; the extension previously stayed silent because
 * MemberLocatorService.extractTypeFromToken returned null for a bare CLASS
 * specifically (QUEUE/GROUP/FILE already resolved to themselves).
 *
 * The real-world repro that surfaced this also had colons in the receiver AND
 * method names (`MyOwn:CLASS.My:My:Method()`) — that half is a SEPARATE fix
 * (DOTCALL_PREFIX in ReturnValueDiagnostics.ts, `fix/discarded-return-colon-receiver`,
 * not part of this branch) and isn't exercisable end-to-end here alone, since
 * without it the line never matches DOTCALL_PREFIX regardless of this fix. The
 * plain-name test below proves this CLASS fix end-to-end through the real
 * diagnostic; `MemberLocatorService.test.ts`'s
 * "resolves bare local CLASS self-instance ... → member" pins the colon-named
 * case directly at the resolveDotAccess layer (hover/F12/Ctrl+F12's own entry
 * point), bypassing DOTCALL_PREFIX. Once both PRs land, the colon+bare-CLASS
 * combo works through the full pipeline too — confirmed manually, not repeated
 * here as an automated test to avoid a cross-branch test dependency.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { validateDiscardedReturnValues } from '../providers/diagnostics/ReturnValueDiagnostics';
import { setServerInitialized } from '../serverState';

let tmpDir: string;

function createDoc(filename: string, code: string): TextDocument {
    const filePath = path.join(tmpDir, filename);
    fs.writeFileSync(filePath, code);
    const uri = `file:///${filePath.replace(/\\/g, '/')}`;
    return TextDocument.create(uri, 'clarion', 1, code);
}

suite('ReturnValueDiagnostics — bare local CLASS self-instance receiver', () => {

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rvdBareClass_'));
    });
    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });
    teardown(() => TokenCache.getInstance().clearAllTokens());

    const discarded = (diags: { message: string }[]) =>
        diags.filter(d => /is discarded/.test(d.message));

    test('plain-name repro (no colons anywhere) — full pipeline, end to end', async () => {
        const code = [
            "  MEMBER('prog.clw')",
            '  MAP',
            '  END',
            'MyClass CLASS',
            'Method  PROCEDURE(), LONG',
            '      END',
            'Caller PROCEDURE()',
            '  CODE',
            '  MyClass.Method()',
        ].join('\n');
        const doc = createDoc('rvdBareClassPlain.clw', code);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const locator = new MemberLocatorService();
        const diags = await validateDiscardedReturnValues(tokens, doc, locator);

        const warns = discarded(diags);
        assert.strictEqual(warns.length, 1,
            `plain-name bare CLASS self-instance must warn too — confirms the gap was never colon-specific; got: ${warns.map(w => w.message).join(' | ')}`);
        assert.ok(warns[0].message.includes("'MyClass.Method'"));
    });

    test('PROC-attributed method on a bare CLASS self-instance stays silent', async () => {
        const code = [
            "  MEMBER('prog.clw')",
            '  MAP',
            '  END',
            'MyClass CLASS',
            'Method  PROCEDURE(), LONG, PROC',
            '      END',
            'Caller PROCEDURE()',
            '  CODE',
            '  MyClass.Method()',
        ].join('\n');
        const doc = createDoc('rvdBareClassProc.clw', code);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const locator = new MemberLocatorService();
        const diags = await validateDiscardedReturnValues(tokens, doc, locator);

        assert.strictEqual(discarded(diags).length, 0, 'PROC-attributed method must not warn');
    });
});
