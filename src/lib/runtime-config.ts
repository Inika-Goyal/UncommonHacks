type EnvShape = Record<string, string | undefined>;

export class ConfigError extends Error {
  code = "CONFIGURATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function isDemoMode(env: EnvShape = process.env) {
  return env.NEXT_PUBLIC_DEMO_MODE === "true";
}

export function getSupabaseServerConfig(env: EnvShape = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secretKey) {
    throw new ConfigError(
      "Supabase is not configured. Set NEXT_PUBLIC_DEMO_MODE=true for the labeled MVP fixtures, or provide NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.",
    );
  }

  return { url, secretKey };
}
