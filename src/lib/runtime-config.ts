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

export function getOpenAIConfig(env: EnvShape = process.env) {
  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new ConfigError(
      "OpenAI is not configured. Set OPENAI_API_KEY in .env to run the agent swarm, or enable NEXT_PUBLIC_DEMO_MODE=true for fixtures.",
    );
  }

  return {
    apiKey,
    synthesisModel: env.OPENAI_SYNTHESIS_MODEL ?? "gpt-4o",
    extractionModel: env.OPENAI_EXTRACTION_MODEL ?? "gpt-4o-mini",
  };
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

export function getElevenLabsConfig(env: EnvShape = process.env) {
  const apiKey = env.ELEVENLABS_API_KEY;
  const agentId = env.ELEVENLABS_AGENT_ID ?? env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

  if (!apiKey) {
    throw new ConfigError(
      "ElevenLabs is not configured. Set ELEVENLABS_API_KEY in .env.local to start the report-aware voice agent.",
    );
  }

  if (!agentId) {
    throw new ConfigError(
      "ElevenLabs agent is not configured. Set ELEVENLABS_AGENT_ID in .env.local after creating the report-aware agent.",
    );
  }

  return { apiKey, agentId };
}
