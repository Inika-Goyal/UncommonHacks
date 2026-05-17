import { ChatOpenAI } from "@langchain/openai";

import { getOpenAIConfig } from "@/lib/runtime-config";

export type LlmRole = "extraction" | "synthesis";

export function createChatModel(role: LlmRole = "extraction") {
  const { apiKey, extractionModel, synthesisModel } = getOpenAIConfig();

  return new ChatOpenAI({
    apiKey,
    model: role === "synthesis" ? synthesisModel : extractionModel,
    temperature: role === "synthesis" ? 0.2 : 0.1,
  });
}
