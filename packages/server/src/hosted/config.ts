export type HostedConfig = { secret: string; publicUrl: string; dataDir: string; invite: string };

/** Hosted mode is on only when AURORA_MODE=hosted; then the secret, public URL and invite are required. */
export function loadHostedConfig(env: Record<string, string | undefined>): HostedConfig | undefined {
  if (env.AURORA_MODE !== "hosted") return undefined;
  const need = (name: string): string => {
    const v = env[name];
    if (!v) throw new Error(`hosted mode requires ${name}`);
    return v;
  };
  const secret = need("AURORA_SECRET");
  if (secret.length < 32) throw new Error("AURORA_SECRET must be at least 32 characters");
  const publicUrl = need("AURORA_PUBLIC_URL");
  const invite = need("AURORA_INVITE");
  return { secret, publicUrl, dataDir: env.AURORA_DATA_DIR || "/data", invite };
}
