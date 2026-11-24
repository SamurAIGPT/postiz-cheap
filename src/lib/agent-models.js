import { z } from "zod";
import { AGENT_MODEL_ID, isSupportedAgentModel } from "@/lib/agent-model-config";

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
  })).max(30),
});

const NVIDIA_CHAT_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

function toNvidiaError(error) {
  if (error.name === "AbortError" || error.name === "TimeoutError") return error;

  const providerStatus = Number(error.statusCode || error.status);
  const status = Number.isInteger(providerStatus) ? providerStatus : 502;
  const message = status === 401 || status === 403
    ? "NVIDIA could not authenticate this request. Check that NVIDIA_API_KEY is valid in your Vercel project settings."
    : status === 429
      ? "The NVIDIA model is busy or its rate limit was reached. Please try again shortly."
      : status === 503 && !process.env.NVIDIA_API_KEY
      ? "NVIDIA_API_KEY is missing. Add the NVIDIA API integration in your Vercel project settings."
      : "The NVIDIA model could not complete the request. Please try again.";

  return Object.assign(new Error(message), { status, cause: error });
}

async function requestNvidiaModel({ modelId, messages, maxTokens, abortSignal, json = false }) {
  if (!isSupportedAgentModel(modelId)) {
    throw Object.assign(new Error("Choose a supported NVIDIA writing model."), { status: 400 });
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error("NVIDIA_API_KEY is not configured for this deployment."), { status: 503 });
  }

  const response = await fetch(NVIDIA_CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      max_tokens: maxTokens,
      temperature: 0.4,
      stream: false,
      chat_template_kwargs: { enable_thinking: false },
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: abortSignal,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.detail || payload?.error?.message;
    throw Object.assign(new Error(typeof detail === "string" ? detail : "NVIDIA request failed."), { status: response.status });
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw Object.assign(new Error("NVIDIA returned an empty response. Please try again."), { status: 502 });
  }
  return content;
}

export async function generateAgentResponse({ modelId = AGENT_MODEL_ID, instructions, prompt, maxOutputTokens = 8000, abortSignal }) {
  try {
    const content = await requestNvidiaModel({
      modelId,
      messages: [
        {
          role: "system",
          content: `${instructions}\n\nReturn only a JSON object in this exact shape: {"reply":"short answer","needsClarification":false,"postProposals":[{"platforms":["instagram"],"title":"draft title","description":"draft text","tags":"#tag"}]}. Always include all three top-level keys. Each platforms value must be an array containing exactly one of: youtube, tiktok, instagram, x_twitter, facebook, linkedin, threads, pinterest. If there are no drafts, use an empty postProposals array.`,
        },
        { role: "user", content: prompt },
      ],
      maxTokens: maxOutputTokens,
      abortSignal,
      json: true,
    });
    return AgentResponseSchema.parse(JSON.parse(content));
  } catch (error) {
    throw toNvidiaError(error);
  }
}

export async function testAgentModel({ modelId = AGENT_MODEL_ID, abortSignal }) {
  try {
    return await requestNvidiaModel({
      modelId,
      messages: [{ role: "user", content: "Reply with the single word READY." }],
      maxTokens: 128,
      abortSignal,
    });
  } catch (error) {
    throw toNvidiaError(error);
  }
}
