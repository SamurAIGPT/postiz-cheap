export const AGENT_MODEL_ID = "nvidia/nemotron-3.5-lightning-30b-a3b";

export const AGENT_MODELS = [
  {
    id: AGENT_MODEL_ID,
    name: "Nemotron 3.5 Lightning",
    provider: "NVIDIA API",
    costLabel: "Uses your NVIDIA API key",
    description: "Fast, reliable social copy generation with reasoning disabled for concise drafts.",
  },
  {
    id: "nvidia/nemotron-3.5-bolt-e4b",
    name: "Nemotron 3.5 Bolt E4B",
    provider: "NVIDIA API",
    costLabel: "Uses your NVIDIA API key",
    description: "A smaller, responsive option for everyday social posts.",
  },
];

export const LEGACY_MEDIA_AGENT_MODEL_ID = AGENT_MODEL_ID;

export function isSupportedAgentModel(modelId) {
  return AGENT_MODELS.some((model) => model.id === modelId);
}
