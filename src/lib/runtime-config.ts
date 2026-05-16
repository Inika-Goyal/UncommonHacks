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
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new ConfigError(
      "Supabase is not configured. Set NEXT_PUBLIC_DEMO_MODE=true for the labeled MVP fixtures, or provide NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return { url, serviceRoleKey };
}
