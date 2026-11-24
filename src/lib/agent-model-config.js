export const AGENT_MODEL_ID = "anthropic/claude-sonnet-5.5";

export const AGENT_MODELS = [
  {
    id: AGENT_MODEL_ID,
    name: "Claude Sonnet 5.5",
    provider: "Vercel AI Gateway",
    costLabel: "Usage-based",
    description: "Concise, context-aware writing for platform-specific social drafts.",
  },
];

export const LEGACY_MEDIA_AGENT_MODEL_ID = "nvidia/nemotron-3.5-lightning-30b-a3b";

export function isSupportedAgentModel(modelId) {
  return modelId === AGENT_MODEL_ID || modelId === LEGACY_MEDIA_AGENT_MODEL_ID;
}
