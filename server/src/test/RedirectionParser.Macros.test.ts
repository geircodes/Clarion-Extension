import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RedirectionFileParserServer } from '../solution/redirectionFileParserServer';
import { serverSettings } from '../serverSettings';

/**
 * #435 — the redirection macros documented in `redirection_file.htm`'s
 * "Additional Macros" block.
 *
 * `%ROOT%` and `%REDDIR%` need no parser support: both live under
 * `RedirectionFile/Macros` in `ClarionProperties.xml` and arrive via
 * `serverSettings.macros`. `%BIN%` and `%REDNAME%` were already special-cased.
 * The three added here were not, and an unresolved macro is NOT inert — the
 * literal `%THISDIR%` text stays in the path, so every directory on that line
 * silently fails to resolve.
 *
 * `%THISDIR%` is the one that carries weight. The Clarion 8 release notes
 * define it as "the directory of the *current* redirection file", which is
 * per-file, not per-parse: inside an `{include}`d red it must expand to THAT
 * file's directory. That is the behaviour `nested {include}` locks down below.
 *
 * `%libpath%` is deliberately unimplemented — documented as `[Copy]`-section
 * only (the folder holding the `.lib` when copying the matching `.dll`), so it
 * has no bearing on source lookup.
 *
 * Not covered here: the one-time `logger.warn` for an unexpanded macro. The
 * module-level logger is not injectable, so the observable contract asserted
 * instead is the literal passthrough it accompanies.
 */

interface Fixture {
    tmpRoot: string;
    projDir: string;
}

/** Writes a project-local `Clarion110.red` plus any extra files, and returns the dirs. */
function buildFixture(rootRed: string, files: { [relPath: string]: string } = {}): Fixture {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'red-macros-435-'));
    const projDir = path.join(tmpRoot, 'Proj');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'Clarion110.red'), rootRed);
    for (const [relPath, content] of Object.entries(files)) {
        const fullPath = path.join(tmpRoot, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
    }
    return { tmpRoot, projDir };
}

suite('RedirectionParser.Macros (#435)', () => {

    let fixtures: Fixture[] = [];
    let savedRedirectionFile = '';
    let savedConfiguration = '';
    let savedLibsrc: string[] = [];
    let savedMacros: Record<string, string> = {};

    setup(() => {
        fixtures = [];
        savedRedirectionFile = serverSettings.redirectionFile;
        savedConfiguration = serverSettings.configuration;
        savedLibsrc = serverSettings.libsrcPaths;
        savedMacros = serverSettings.macros;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.configuration = 'Release';
        serverSettings.libsrcPaths = [];
        serverSettings.macros = {};
    });

    teardown(() => {
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.configuration = savedConfiguration;
        serverSettings.libsrcPaths = savedLibsrc;
        serverSettings.macros = savedMacros;
        for (const fix of fixtures) {
            try { fs.rmSync(fix.tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
        }
    });

    const clwPaths = (parser: RedirectionFileParserServer, projDir: string): string[] =>
        parser.parseRedFile(projDir)
            .filter(e => e.extension.toLowerCase() === '*.clw')
            .flatMap(e => e.paths);

    // ---- %THISDIR% ----

    test('%THISDIR% in the root red expands to that red\'s own directory', () => {
        const fix = buildFixture('[Common]\n*.clw = %THISDIR%\\src\n');
        fixtures.push(fix);
        const paths = clwPaths(new RedirectionFileParserServer(), fix.projDir);
        assert.deepStrictEqual(
            paths.map(p => p.toLowerCase()),
            [path.join(fix.projDir, 'src').toLowerCase()],
            'the root red lives in projDir, so %THISDIR% is projDir'
        );
    });

    test('%THISDIR% is case-insensitive, like every other macro', () => {
        const fix = buildFixture('[Common]\n*.clw = %thisdir%\\src\n');
        fixtures.push(fix);
        const paths = clwPaths(new RedirectionFileParserServer(), fix.projDir);
        assert.deepStrictEqual(
            paths.map(p => p.toLowerCase()),
            [path.join(fix.projDir, 'src').toLowerCase()]
        );
    });

    test('%THISDIR% inside an {include}d red expands to the INCLUDED file\'s directory', () => {
        // The whole point of the macro per the C8 notes: nested redirection
        // files anchoring to themselves. If %THISDIR% were resolved once per
        // parse rather than per file, this would wrongly yield projDir.
        const fix = buildFixture(
            '[Common]\n{include shared\\Common.red}\n',
            { 'Proj\\shared\\Common.red': '[Common]\n*.clw = %THISDIR%\\classes\n' }
        );
        fixtures.push(fix);
        const paths = clwPaths(new RedirectionFileParserServer(), fix.projDir);
        const expected = path.join(fix.projDir, 'shared', 'classes').toLowerCase();
        const parentAnchored = path.join(fix.projDir, 'classes').toLowerCase();
        assert.deepStrictEqual(paths.map(p => p.toLowerCase()), [expected],
            `%THISDIR% must anchor to the included red, not the parent (parent would give ${parentAnchored})`);
    });

    test('%THISDIR% resolves a real file end-to-end through findFile', () => {
        const fix = buildFixture(
            '[Common]\n*.clw = %THISDIR%\\classes\n',
            { 'Proj\\classes\\Target.clw': '! found via %THISDIR%\n' }
        );
        fixtures.push(fix);
        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('Target.clw');
        assert.ok(result, 'a %THISDIR%-anchored dir must be searchable, not just parsed');
        assert.strictEqual(
            path.normalize(result!.path).toLowerCase(),
            path.join(fix.projDir, 'classes', 'Target.clw').toLowerCase()
        );
    });

    // ---- AppData macros ----

    test('%WinUserApplicationData% expands to the roaming AppData directory', () => {
        const fix = buildFixture('[Common]\n*.clw = %WinUserApplicationData%\\ClarionShared\n');
        fixtures.push(fix);
        const expectedBase = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
        const paths = clwPaths(new RedirectionFileParserServer(), fix.projDir);
        assert.deepStrictEqual(
            paths.map(p => p.toLowerCase()),
            [path.join(expectedBase, 'ClarionShared').toLowerCase()]
        );
    });

    test('%WinCommonApplicationData% expands to the common AppData directory', () => {
        const fix = buildFixture('[Common]\n*.clw = %WinCommonApplicationData%\\ClarionShared\n');
        fixtures.push(fix);
        const expectedBase = process.env.PROGRAMDATA || path.join('C:', 'ProgramData');
        const paths = clwPaths(new RedirectionFileParserServer(), fix.projDir);
        assert.deepStrictEqual(
            paths.map(p => p.toLowerCase()),
            [path.join(expectedBase, 'ClarionShared').toLowerCase()]
        );
    });

    // ---- regression guards ----

    test('a ClarionProperties macro still wins over the built-in fallbacks', () => {
        // %THISDIR% must not shadow a user-defined macro of the same name.
        const fix = buildFixture('[Common]\n*.clw = %THISDIR%\\src\n');
        fixtures.push(fix);
        serverSettings.macros = { thisdir: path.join('C:', 'Explicit') };
        const paths = clwPaths(new RedirectionFileParserServer(), fix.projDir);
        assert.deepStrictEqual(
            paths.map(p => p.toLowerCase()),
            [path.join('C:', 'Explicit', 'src').toLowerCase()],
            'serverSettings.macros is consulted before any hardcoded fallback'
        );
    });

    test('an unknown macro is still left literal, so behaviour is unchanged', () => {
        const fix = buildFixture('[Common]\n*.clw = %NOSUCHMACRO%\\src\n');
        fixtures.push(fix);
        const paths = clwPaths(new RedirectionFileParserServer(), fix.projDir);
        assert.strictEqual(paths.length, 1);
        assert.ok(paths[0].includes('%NOSUCHMACRO%'),
            `an undefined macro keeps its literal text (a one-time warning is logged); got ${paths[0]}`);
    });

    test('%ROOT% from ClarionProperties is unaffected by the new cases', () => {
        const fix = buildFixture('[Common]\n*.clw = %ROOT%\\libsrc\\win\n');
        fixtures.push(fix);
        serverSettings.macros = { root: path.join('C:', 'Clarion12') };
        const paths = clwPaths(new RedirectionFileParserServer(), fix.projDir);
        assert.deepStrictEqual(
            paths.map(p => p.toLowerCase()),
            [path.join('C:', 'Clarion12', 'libsrc', 'win').toLowerCase()]
        );
    });
});
