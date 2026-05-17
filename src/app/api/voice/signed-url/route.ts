import { ConfigError, getElevenLabsConfig } from "@/lib/runtime-config";

export const runtime = "nodejs";

type ElevenLabsSignedUrlResponse = {
  signed_url?: string;
  detail?: unknown;
};

export async function POST() {
  try {
    const { apiKey, agentId } = getElevenLabsConfig();
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      {
        cache: "no-store",
        headers: {
          "xi-api-key": apiKey,
        },
      },
    );
    const payload = (await response.json().catch(() => ({}))) as ElevenLabsSignedUrlResponse;

    if (!response.ok || !payload.signed_url) {
      return Response.json(
        {
          ok: false,
          code: "ELEVENLABS_SIGNED_URL_FAILED",
          error:
            typeof payload.detail === "string"
              ? payload.detail
              : `ElevenLabs signed URL request failed with HTTP ${response.status}.`,
        },
        { status: response.ok ? 502 : response.status },
      );
    }

    return Response.json({ ok: true, signedUrl: payload.signed_url });
  } catch (error) {
    if (error instanceof ConfigError) {
      return Response.json(
        { ok: false, code: error.code, error: error.message },
        { status: 503 },
      );
    }

    return Response.json(
      {
        ok: false,
        code: "ELEVENLABS_SIGNED_URL_ERROR",
        error: error instanceof Error ? error.message : "Unable to start the ElevenLabs voice agent.",
      },
      { status: 500 },
    );
  }
}
