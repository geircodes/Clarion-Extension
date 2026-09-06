/**
 * #437 — the pure decision point for validating a stored build configuration
 * against the configurations a solution actually declares.
 *
 * Deliberately free of the `vscode` API (and of any I/O), mirroring the
 * `SolutionFallbackPolicy` / `SymbolFilter` pattern, so the interesting logic
 * can be unit-tested directly. `ConfigurationValidator.resolveValidConfiguration`
 * is the thin wrapper that reads the `.sln` and runs the prompt.
 */

export type ConfigurationDecision =
    /** `current` is already one of the solution's declared configurations. */
    | { kind: 'valid'; configuration: string }
    /**
     * An old-style bare name matched exactly one platform-qualified
     * configuration, e.g. `Debug` against a solution declaring `Debug|Win32`.
     * Upgraded without asking — there is nothing for the user to decide.
     */
    | { kind: 'migrated'; configuration: string }
    /** Cannot be reconciled; the user must choose from `choices`. */
    | { kind: 'prompt'; choices: string[] };

/**
 * @param available Configurations declared by the solution, e.g.
 *   `["Debug|Win32", "Release|Win32"]`. Order is the solution's own.
 * @param current The stored configuration. May be empty (never configured).
 */
export function decideConfiguration(available: string[], current: string): ConfigurationDecision {
    if (available.includes(current)) {
        return { kind: 'valid', configuration: current };
    }

    // An empty configuration has nothing to migrate FROM: `''` would prefix-match
    // every entry, so the guard is load-bearing, not defensive.
    if (current) {
        const migrated = available.find(config => config.startsWith(current + '|'));
        if (migrated) {
            return { kind: 'migrated', configuration: migrated };
        }
    }

    return { kind: 'prompt', choices: available };
}
