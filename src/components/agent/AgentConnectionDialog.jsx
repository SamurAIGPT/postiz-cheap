"use client";

import { useState } from "react";
import { FiCheckCircle, FiLoader, FiX, FiZap } from "react-icons/fi";
import { AGENT_MODEL_ID, AGENT_MODELS } from "@/lib/agent-model-config";

export default function AgentConnectionDialog({ isOpen, onClose, onSave, initialConfig }) {
  const [modelId, setModelId] = useState(AGENT_MODELS.some((model) => model.id === initialConfig?.model) ? initialConfig.model : AGENT_MODEL_ID);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const selectedModel = AGENT_MODELS.find((model) => model.id === modelId);

  const handleConnect = async (event) => {
    event.preventDefault();
    setConnecting(true);
    setError("");

    try {
      const response = await fetch("/api/agent/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not connect the model.");
      onSave(modelId);
      onClose();
    } catch (connectError) {
      setError(connectError.message || "Could not connect the model.");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !connecting && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="agent-connection-title" className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-[#171717] sm:p-6">
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              <FiZap aria-hidden="true" /> NVIDIA AI
            </p>
            <h2 id="agent-connection-title" className="text-base font-semibold text-zinc-900 dark:text-white">Connect your marketing agent</h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Choose a writing model and test it using the NVIDIA API key already configured for this project.</p>
          </div>
          <button type="button" onClick={onClose} disabled={connecting} aria-label="Close model settings" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"><FiX aria-hidden="true" /></button>
        </header>

        <form onSubmit={handleConnect} className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">Writing model</legend>
            {AGENT_MODELS.map((model) => (
              <label key={model.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${modelId === model.id ? "border-[#612bd3] bg-[#612bd3]/5 dark:border-violet-400 dark:bg-violet-400/5" : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"}`}>
                <input type="radio" name="agent-model" value={model.id} checked={modelId === model.id} onChange={() => setModelId(model.id)} className="mt-1 accent-[#612bd3]" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">{model.name}<span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">{model.costLabel}</span></span>
                  <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{model.provider} · {model.description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {initialConfig?.model && selectedModel && (
            <p className="inline-flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300"><FiCheckCircle aria-hidden="true" /> Currently connected · {selectedModel.name}</p>
          )}
          {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <p className="max-w-[260px] text-[11px] leading-relaxed text-zinc-500">Model usage is subject to the NVIDIA API account&apos;s limits and pricing.</p>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} disabled={connecting} className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">Cancel</button>
              <button type="submit" disabled={connecting || !modelId} className="inline-flex items-center gap-2 rounded-lg bg-[#612bd3] px-3 py-2 text-xs font-semibold text-white hover:bg-[#7237e8] disabled:cursor-not-allowed disabled:opacity-60">
                {connecting ? <><FiLoader className="animate-spin" aria-hidden="true" /> Checking…</> : "Connect model"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
