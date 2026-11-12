/**
 * Host half of the selection-annotation bundle.
 *
 * The feature lives entirely in the browser: selection reading, the reply
 * popup, and the composer insertion. The Host row only makes the bundle
 * visible to the profile loader and Plugin Manager, so it owns no state and
 * registers no services.
 */
export function apply() {}
