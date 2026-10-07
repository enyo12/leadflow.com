/**
 * Export limits shared by the route handler and the UI.
 *
 * Deliberately its own module: the route enforces the cap and the interface
 * explains it, and both need to be reading the same number. This file imports
 * nothing, so it is safe to pull into a Client Component.
 */

/**
 * Upper bound on one export.
 *
 * An export is a single query and a single file, both held in memory, so it
 * needs a ceiling. This is a prototype-scale limit, not a considered product
 * decision — the behaviour that matters is that a selection above it is
 * *refused with an explanation* rather than quietly truncated to fit.
 */
export const MAX_EXPORT_LEADS = 500;
