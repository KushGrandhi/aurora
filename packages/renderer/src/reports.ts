export type Pending = { version: number; ok: Set<string>; failed: Map<string, string> };

/**
 * Adds one item's render report to the pending report for its view. A newer version starts fresh; a report for an
 * older version (an engine finishing late) returns undefined and must be ignored, or it would discard the newer one.
 */
export function mergeReport(p: Pending | undefined, version: number, itemId: string, ok: boolean, message?: string): Pending | undefined {
  if (p && version < p.version) return undefined;
  const next = !p || p.version !== version ? { version, ok: new Set<string>(), failed: new Map<string, string>() } : p;
  if (ok && !next.failed.has(itemId)) next.ok.add(itemId);
  else if (!ok) {
    next.ok.delete(itemId);
    next.failed.set(itemId, message ?? "failed");
  }
  return next;
}
