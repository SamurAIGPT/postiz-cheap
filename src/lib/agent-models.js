export const FREE_AGENT_MODELS = [
  {
    id: "nvidia/nemotron-3.5-lightning-free",
    name: "NVIDIA Nemotron 3.5 Lightning",
    provider: "Vercel AI Gateway",
    costLabel: "Free",
  },
];

const FREE_AGENT_MODEL_IDS = new Set(FREE_AGENT_MODELS.map((model) => model.id));

export function isFreeAgentModel(modelId) {
  return typeof modelId === "string" && FREE_AGENT_MODEL_IDS.has(modelId);
}
