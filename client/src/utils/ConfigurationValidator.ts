import { window as vscodeWindow } from 'vscode';
import * as fs from 'fs';
import { extractConfigurationsFromSolution } from './ExtensionHelpers';
import { decideConfiguration } from './ConfigurationPolicy';
import LoggerManager from './LoggerManager';

const logger = LoggerManager.getLogger("ConfigurationValidator");
logger.setLevel("error");

/**
 * #437 — validating a stored build configuration against the configurations a
 * solution actually declares.
 *
 * This used to live inline in `initializeSolution`, which meant the guarantee
 * belonged to the *callers* of the opener rather than to the act of adopting a
 * solution — and one caller had already dropped it: `clarion.openRecentSolution`
 * re-opening a solution in the folder you are already in went through
 * `SmartSolutionOpener` and returned without ever reaching `initializeSolution`.
 * A stale configuration then stayed in force for the whole session.
 *
 * That matters because a configuration matching no `.red` section collapses the
 * search paths to `[Common]` only (see #293), which on a large solution can
 * leave most source files unresolvable — silently, since the solution still
 * reports as opened.
 *
 * The resolver deliberately does NOT persist anything. Both call sites already
 * own a `setGlobalClarionSelection` / `saveSolutionSettings` sequence with their
 * own ordering requirements (`skipSave`, save-after-globals), and threading a
 * write in here would have meant duplicating or fighting that.
 */

export type ConfigurationResolution =
    /** Already one of the solution's declared configurations. */
    | 'valid'
    /** Old-style bare name upgraded to `Config|Platform` (e.g. `Debug` → `Debug|Win32`). */
    | 'migrated'
    /** The user chose one from the prompt. */
    | 'picked'
    /** The user dismissed the prompt; the solution's first configuration was used. */
    | 'fallback'
    /** The solution file could not be read, so nothing was verified and the input stands. */
    | 'unverifiable';

export interface ResolvedConfiguration {
    /** The configuration to use. Equal to the input unless `changed` is true. */
    configuration: string;
    /** True when the caller must persist `configuration` and repaint the status bar. */
    changed: boolean;
    reason: ConfigurationResolution;
}

/**
 * Resolves `current` against the configurations declared by `solutionFile`,
 * prompting only when it cannot be reconciled automatically.
 *
 * @param solutionFile Absolute path to the `.sln`.
 * @param current The stored configuration, e.g. `Debug|Win32`. May be empty.
 */
export async function resolveValidConfiguration(
    solutionFile: string,
    current: string
): Promise<ResolvedConfiguration> {
    let available: string[];
    try {
        available = extractConfigurationsFromSolution(fs.readFileSync(solutionFile, 'utf-8'));
    } catch (error) {
        // An unreadable solution is not this function's problem to report — the
        // openers already check existence, and failing to verify must not block
        // opening. Leave the stored value alone and say so.
        logger.warn(`⚠️ Could not read ${solutionFile} to verify the configuration: ` +
            `${error instanceof Error ? error.message : String(error)}`);
        return { configuration: current, changed: false, reason: 'unverifiable' };
    }

    const decision = decideConfiguration(available, current);

    if (decision.kind === 'valid') {
        return { configuration: decision.configuration, changed: false, reason: 'valid' };
    }

    if (decision.kind === 'migrated') {
        logger.info(`🔄 Auto-migrating configuration: ${current} → ${decision.configuration}`);
        return { configuration: decision.configuration, changed: true, reason: 'migrated' };
    }

    logger.warn(`⚠️ Invalid configuration "${current}" for ${solutionFile}. Asking the user to select a valid one.`);
    const picked = await vscodeWindow.showQuickPick(decision.choices, {
        placeHolder: "Invalid configuration detected. Select a valid configuration:",
    });

    if (picked) {
        return { configuration: picked, changed: true, reason: 'picked' };
    }

    vscodeWindow.showWarningMessage("No valid configuration selected. Using first available configuration as fallback.");
    return {
        configuration: available[0] || "Debug|Win32",
        changed: true,
        reason: 'fallback'
    };
}
