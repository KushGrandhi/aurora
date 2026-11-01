import type { Spec } from "@genui/spec";

export class SpecCache {
  private map = new Map<string, Spec>();
  constructor(private max = 200) {}

  key(fingerprint: string, intent?: string): string {
    return `${fingerprint}\n${(intent ?? "").toLowerCase().trim().replace(/\s+/g, " ")}`;
  }

  get(k: string): Spec | undefined {
    const v = this.map.get(k);
    if (v) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }

  set(k: string, spec: Spec): void {
    this.map.delete(k);
    this.map.set(k, spec);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
  }
}
