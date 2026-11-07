export type Pending = { version: number; ok: Set<string>; failed: Map<string, string>; warnings: Map<string, string[]> };

const fresh = (version: number): Pending => ({ version, ok: new Set<string>(), failed: new Map<string, string>(), warnings: new Map<string, string[]>() });

/**
 * Adds one item's render report to the pending report for its view. A newer version starts fresh; a report for an
 * older version (an engine finishing late) returns undefined and must be ignored, or it would discard the newer one.
 * Failures win over later ok reports, unless the ok report `retract`s them (a slow design that did finish after all).
 */
export function mergeReport(p: Pending | undefined, version: number, itemId: string, ok: boolean, message?: string, retract = false): Pending | undefined {
  if (p && version < p.version) return undefined;
  const next = !p || p.version !== version ? fresh(version) : p;
  if (ok && retract) next.failed.delete(itemId);
  if (ok && !next.failed.has(itemId)) next.ok.add(itemId);
  else if (!ok) {
    next.ok.delete(itemId);
    next.failed.set(itemId, message ?? "failed");
  }
  return next;
}

/** Records an item's design-check warnings for a version (an empty list clears them). Same version rules as mergeReport. */
export function mergeWarnings(p: Pending | undefined, version: number, itemId: string, messages: string[]): Pending | undefined {
  if (p && version < p.version) return undefined;
  const next = !p || p.version !== version ? fresh(version) : p;
  if (messages.length) next.warnings.set(itemId, messages);
  else next.warnings.delete(itemId);
  return next;
}
