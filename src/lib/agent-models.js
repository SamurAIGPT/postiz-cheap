export const FREE_AGENT_MODELS = [
  {
    id: "nvidia/nemotron-3.5-lightning-30b-a3b",
    name: "NVIDIA Nemotron 3.5 Lightning",
    provider: "NVIDIA NIM",
    costLabel: "Free",
  },
];

const FREE_AGENT_MODEL_IDS = new Set(FREE_AGENT_MODELS.map((model) => model.id));
const NVIDIA_CHAT_COMPLETIONS_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

export function isFreeAgentModel(modelId) {
  return typeof modelId === "string" && FREE_AGENT_MODEL_IDS.has(modelId);
}

export async function generateFreeAgentText({ modelId, system, prompt, maxOutputTokens, abortSignal }) {
  if (!isFreeAgentModel(modelId)) {
    throw new Error("Choose an available free model.");
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error("NVIDIA NIM is not configured. Add NVIDIA_API_KEY to the Vercel project environment."), { status: 503 });
  }

  const response = await fetch(NVIDIA_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
      max_tokens: maxOutputTokens,
      stream: false,
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: abortSignal,
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const status = response.status === 401 || response.status === 403 ? 503 : response.status;
    const message = response.status === 401 || response.status === 403
      ? "NVIDIA NIM rejected the configured API key. Check NVIDIA_API_KEY in the Vercel project environment."
      : response.status === 429
        ? "NVIDIA NIM is rate-limiting requests. Please try again shortly."
        : "NVIDIA NIM could not complete the request. Please try again.";
    throw Object.assign(new Error(message), { status });
  }

  const text = result?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw Object.assign(new Error("NVIDIA NIM returned an empty response. Please try again."), { status: 502 });
  }

  return text;
}
