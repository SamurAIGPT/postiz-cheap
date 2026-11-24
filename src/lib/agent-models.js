import { generateText, Output } from "ai";
import { z } from "zod";
import { AGENT_MODEL_ID } from "@/lib/agent-model-config";

const PLATFORM_KEYS = [
  "youtube",
  "tiktok",
  "instagram",
  "x_twitter",
  "facebook",
  "linkedin",
  "threads",
  "pinterest",
];

const AgentResponseSchema = z.object({
  reply: z.string().max(500),
  needsClarification: z.boolean(),
  postProposals: z.array(z.object({
    platforms: z.array(z.enum(PLATFORM_KEYS)).min(1).max(1),
    title: z.string().max(120),
    description: z.string().max(2400),
    tags: z.string().max(300),
  })).max(9),
});

function toGatewayError(error) {
  if (error.name === "AbortError" || error.name === "TimeoutError") return error;

  const providerStatus = Number(error.statusCode || error.status);
  const status = providerStatus === 401 || providerStatus === 403
    ? 503
    : Number.isInteger(providerStatus) ? providerStatus : 502;
  const message = status === 429
    ? "The AI model is busy right now. Please try again shortly."
    : providerStatus === 401 || providerStatus === 403
      ? "AI Gateway could not authenticate the request. Check the Vercel AI Gateway integration."
      : "The AI model could not complete the request. Please try again.";

  return Object.assign(new Error(message), { status, cause: error });
}

export async function generateAgentResponse({ instructions, prompt, maxOutputTokens = 900, abortSignal }) {
  try {
    const { output } = await generateText({
      model: AGENT_MODEL_ID,
      instructions,
      prompt,
      output: Output.object({
        name: "social_agent_response",
        description: "A concise answer, a single clarifying question, or ready-to-review social post drafts.",
        schema: AgentResponseSchema,
      }),
      maxOutputTokens,
      abortSignal,
    });

    return output;
  } catch (error) {
    throw toGatewayError(error);
  }
}

export async function testAgentModel({ abortSignal }) {
  try {
    const { text } = await generateText({
      model: AGENT_MODEL_ID,
      prompt: "Reply with the single word READY.",
      maxOutputTokens: 8,
      abortSignal,
    });
    return text;
  } catch (error) {
    throw toGatewayError(error);
  }
}
