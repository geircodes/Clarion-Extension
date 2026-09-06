import { describe, it } from 'mocha';
import * as assert from 'assert';
import { decideConfiguration } from '../utils/ConfigurationPolicy';

/**
 * #437 — validating a stored build configuration against what the solution
 * declares.
 *
 * The behaviour used to live inline in `initializeSolution`, so the guarantee
 * belonged to the *callers* of the solution opener rather than to the act of
 * adopting a solution — and one caller had already dropped it:
 * `clarion.openRecentSolution`, re-opening a solution in the folder you are
 * already in, went through `SmartSolutionOpener` and returned without ever
 * reaching `initializeSolution`. A stale configuration then stayed in force for
 * the session, and a configuration matching no `.red` section collapses the
 * search paths to `[Common]` only (#293) — silently, since the solution still
 * reports as opened.
 *
 * `decideConfiguration` is the pure decision point extracted from that block,
 * following the `shouldMarkExplicitlyClosed` / `SymbolFilter` vscode-API-free
 * pattern so it can be tested without the editor. The prompt itself and the
 * dismissal fallback live in `ConfigurationValidator`, which is a thin wrapper.
 */
describe('decideConfiguration (#437)', () => {

    const AVAILABLE = ['Debug|Win32', 'Release|Win32'];

    it('accepts a configuration the solution declares, unchanged', () => {
        assert.deepStrictEqual(
            decideConfiguration(AVAILABLE, 'Debug|Win32'),
            { kind: 'valid', configuration: 'Debug|Win32' }
        );
    });

    it('migrates an old-style bare name to its platform-qualified form', () => {
        // The pre-platform storage format, and what a settings file copied from
        // an older workspace still contains.
        assert.deepStrictEqual(
            decideConfiguration(AVAILABLE, 'Debug'),
            { kind: 'migrated', configuration: 'Debug|Win32' }
        );
    });

    it('migrates using the solution\'s own order when several platforms share a name', () => {
        const multi = ['Debug|x64', 'Debug|Win32', 'Release|Win32'];
        assert.deepStrictEqual(
            decideConfiguration(multi, 'Debug'),
            { kind: 'migrated', configuration: 'Debug|x64' },
            'first declared match wins — the solution\'s ordering is the tiebreak'
        );
    });

    it('prompts for a configuration the solution does not declare (the #437 bug-pin)', () => {
        // A renamed or removed build configuration, or settings carried over
        // from a different solution. This is the case that used to be adopted
        // silently on the openRecentSolution path.
        assert.deepStrictEqual(
            decideConfiguration(AVAILABLE, 'MarksDebug|Win32'),
            { kind: 'prompt', choices: AVAILABLE }
        );
    });

    it('prompts when nothing is stored rather than prefix-matching on an empty string', () => {
        // Load-bearing: `''.startsWith` logic would make every entry a match,
        // so an empty configuration must not take the migration path.
        assert.deepStrictEqual(
            decideConfiguration(AVAILABLE, ''),
            { kind: 'prompt', choices: AVAILABLE }
        );
    });

    it('does not treat a bare name as valid just because a qualified one exists', () => {
        // Regression sentinel: `Debug` is NOT in `available`, so it must not
        // short-circuit as 'valid' — it has to go through migration, which is
        // what rewrites the stored value.
        const decision = decideConfiguration(AVAILABLE, 'Debug');
        assert.notStrictEqual(decision.kind, 'valid');
    });

    it('prompts when a stored name is a prefix of nothing declared', () => {
        assert.deepStrictEqual(
            decideConfiguration(AVAILABLE, 'Deb'),
            { kind: 'prompt', choices: AVAILABLE },
            'prefix matching is on the "Name|" boundary, not on arbitrary substrings'
        );
    });

    it('matching is exact, not case-insensitive', () => {
        // Pinning current behaviour rather than asserting it is ideal: the
        // configuration string is compared verbatim against the .sln and is
        // written back verbatim, so a case-folded match would silently rewrite
        // the user's stored value. If this ever needs to change it should be a
        // deliberate decision, not a drive-by.
        assert.deepStrictEqual(
            decideConfiguration(AVAILABLE, 'debug|win32'),
            { kind: 'prompt', choices: AVAILABLE }
        );
    });

    it('prompts with an empty choice list when the solution declares nothing', () => {
        // The wrapper turns this into its "Debug|Win32" fallback; the policy
        // itself stays honest about there being no choices.
        assert.deepStrictEqual(
            decideConfiguration([], 'Debug|Win32'),
            { kind: 'prompt', choices: [] }
        );
    });
});
