"use client";

import { createPortal } from "react-dom";
import { useState } from "react";
import Image from "next/image";
import {
  FiDownload,
  FiFilm,
  FiImage,
  FiLoader,
  FiSave,
  FiX,
} from "react-icons/fi";
import { toast } from "react-hot-toast";

const IMAGE_ASPECT_RATIOS = [
  { value: "square", label: "Square · 1:1" },
  { value: "portrait", label: "Portrait · 3:4" },
  { value: "landscape", label: "Landscape · 4:3" },
];

const VIDEO_ASPECT_RATIOS = [
  { value: "16_9", label: "Landscape · 16:9" },
  { value: "9_16", label: "Portrait · 9:16" },
  { value: "1_1", label: "Square · 1:1" },
];

function suggestBrandText(prompt) {
  const match = prompt.match(/\bfor\s+([a-z0-9&'’ -]{2,60}?)(?:\s+(?:with|using|in|at|on|and)\b.*)?[.!?]*$/i);
  return match?.[1]?.trim().replace(/[.!?]+$/, "") || "";
}

function addBrandText(dataUrl, text) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Could not prepare the generated image."));
        return;
      }

      context.drawImage(image, 0, 0);
      if (text) {
        const panelHeight = Math.round(canvas.height * 0.2);
        const panelTop = canvas.height - panelHeight;
        const gradient = context.createLinearGradient(0, panelTop, 0, canvas.height);
        gradient.addColorStop(0, "rgba(15, 18, 18, 0.56)");
        gradient.addColorStop(1, "rgba(15, 18, 18, 0.78)");
        context.fillStyle = gradient;
        context.fillRect(0, panelTop, canvas.width, panelHeight);

        context.fillStyle = "rgba(224, 197, 155, 0.95)";
        context.fillRect(canvas.width * 0.44, panelTop + panelHeight * 0.28, canvas.width * 0.12, Math.max(2, canvas.height * 0.003));

        let fontSize = Math.round(canvas.height * 0.065);
        const maxWidth = canvas.width * 0.84;
        do {
          context.font = `500 ${fontSize}px Georgia, serif`;
          if (context.measureText(text).width <= maxWidth || fontSize <= 18) break;
          fontSize -= 2;
        } while (fontSize > 18);

        context.fillStyle = "#fffaf2";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.shadowColor = "rgba(0, 0, 0, 0.2)";
        context.shadowBlur = canvas.height * 0.01;
        context.fillText(text, canvas.width / 2, panelTop + panelHeight * 0.62, maxWidth);
      }

      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => reject(new Error("Could not prepare the generated image."));
    image.src = dataUrl;
  });
}

export default function MediaGeneratorModal({ isOpen, onClose, onSaved }) {
  const [mode, setMode] = useState("image");
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("square");
  const [resolution, setResolution] = useState("480p");
  const [frames, setFrames] = useState(25);
  const [brandText, setBrandText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  if (!isOpen) return null;

  const handleModeChange = (nextMode) => {
    setMode(nextMode);
    setResult(null);
    setAspectRatio(nextMode === "image" ? "square" : "16_9");
  };

  const handleGenerate = async (event) => {
    event.preventDefault();
    if (!prompt.trim()) {
      toast.error("Enter a prompt to generate media.");
      return;
    }

    const title = mode === "image" ? (brandText.trim() || suggestBrandText(prompt)) : "";
    if (title) setBrandText(title);

    setGenerating(true);
    setResult(null);
    try {
      const response = await fetch("/api/ai/media-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, prompt, aspectRatio, resolution, frames }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Generation failed.");
      const dataUrl = mode === "image" && title
        ? await addBrandText(payload.dataUrl, title)
        : payload.dataUrl;
      setResult({
        ...payload,
        dataUrl,
        ...(mode === "image" && title ? { mimeType: "image/png", fileExtension: "png" } : {}),
      });
    } catch (error) {
      toast.error(error.message || "Could not generate media.");
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveToLibrary = async () => {
    if (!result?.dataUrl) return;

    setSaving(true);
    try {
      const generatedBlob = await fetch(result.dataUrl).then((response) => response.blob());
      const fileName = `nvidia-${mode}-${Date.now()}.${result.fileExtension}`;
      const formData = new FormData();
      formData.append("file", new File([generatedBlob], fileName, { type: result.mimeType }));

      const uploadResponse = await fetch("/api/upload", { method: "POST", body: formData });
      const uploadPayload = await uploadResponse.json();
      if (!uploadResponse.ok || !uploadPayload.url) {
        throw new Error(uploadPayload.error || "Could not upload the generated file.");
      }

      const mediaResponse = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fileName,
          url: uploadPayload.url,
          type: mode,
          mimeType: result.mimeType,
          size: generatedBlob.size,
          aspectRatio,
          folder: mode === "video" ? "Reels & Shorts" : "Campaigns",
          tags: `generated,nvidia,${result.model}`,
        }),
      });
      const mediaPayload = await mediaResponse.json();
      if (!mediaResponse.ok) throw new Error(mediaPayload.error || "Could not save media to your library.");

      toast.success("Generated media saved to your library.");
      onSaved?.({ url: uploadPayload.url, mode, mimeType: result.mimeType });
    } catch (error) {
      toast.error(error.message || "Could not save generated media.");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (generating || saving) return;
    setPrompt("");
    setBrandText("");
    setResult(null);
    onClose();
  };

  const downloadName = `nvidia-${mode}.${result?.fileExtension || (mode === "video" ? "mp4" : "png")}`;

  const modal = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => event.target === event.currentTarget && handleClose()}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-generator-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-[#141414]"
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-[#612bd3]/10 p-2.5 text-[#612bd3] dark:text-[#a78bfa]">
              <FiImage aria-hidden="true" />
            </span>
            <div>
              <h2 id="media-generator-title" className="text-base font-bold text-zinc-900 dark:text-white">Generate media</h2>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Create an image or a short video with NVIDIA NIM</p>
            </div>
          </div>
          <button type="button" onClick={handleClose} disabled={generating || saving} aria-label="Close media generator" className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-white">
            <FiX aria-hidden="true" />
          </button>
        </header>

        <div className="overflow-y-auto p-5 sm:p-6">
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900" role="tablist" aria-label="Media type">
            <button type="button" role="tab" aria-selected={mode === "image"} onClick={() => handleModeChange("image")} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${mode === "image" ? "bg-white text-[#612bd3] shadow-sm dark:bg-zinc-800 dark:text-violet-300" : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"}`}>
              <FiImage aria-hidden="true" /> Image
            </button>
            <button type="button" role="tab" aria-selected={mode === "video"} onClick={() => handleModeChange("video")} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${mode === "video" ? "bg-white text-[#612bd3] shadow-sm dark:bg-zinc-800 dark:text-violet-300" : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"}`}>
              <FiFilm aria-hidden="true" /> Video
            </button>
          </div>

          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <label htmlFor="generation-prompt" className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Describe what to create</label>
              <textarea
                id="generation-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                maxLength={2000}
                rows={4}
                placeholder={mode === "image" ? "A sunlit editorial product photo of a ceramic coffee cup..." : "A cinematic wide shot of ocean waves rolling toward a quiet beach at sunrise..."}
                className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-[#612bd3] focus:ring-2 focus:ring-[#612bd3]/15 dark:border-zinc-700 dark:bg-[#101012] dark:text-white dark:placeholder:text-zinc-500"
              />
              <div className="mt-1 flex justify-between text-[11px] text-zinc-500"><span>Be specific about style, subject, and setting.</span><span>{prompt.length}/2000</span></div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="generation-ratio" className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Aspect ratio</label>
                <select id="generation-ratio" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-800 outline-none focus:border-[#612bd3] dark:border-zinc-700 dark:bg-[#101012] dark:text-zinc-200">
                  {(mode === "image" ? IMAGE_ASPECT_RATIOS : VIDEO_ASPECT_RATIOS).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              {mode === "video" ? (
                <div>
                  <label htmlFor="video-resolution" className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Resolution</label>
                  <select id="video-resolution" value={resolution} onChange={(event) => setResolution(event.target.value)} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-800 outline-none focus:border-[#612bd3] dark:border-zinc-700 dark:bg-[#101012] dark:text-zinc-200">
                    <option value="480p">480p · faster</option>
                    <option value="720p">720p</option>
                  </select>
                </div>
              ) : (
                <div className="flex items-end rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">Model: FLUX.2 Klein 4B</div>
              )}
            </div>

            {mode === "image" && (
              <div>
                <label htmlFor="generation-brand-text" className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Exact brand or headline text <span className="font-normal text-zinc-500">(optional)</span></label>
                <input
                  id="generation-brand-text"
                  value={brandText}
                  onChange={(event) => setBrandText(event.target.value)}
                  maxLength={60}
                  placeholder="e.g. Relaxio Spa"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-[#612bd3] focus:ring-2 focus:ring-[#612bd3]/15 dark:border-zinc-700 dark:bg-[#101012] dark:text-white dark:placeholder:text-zinc-500"
                />
                <p className="mt-1 text-[11px] text-zinc-500">We keep the generated artwork text-free and render this copy sharply on top.</p>
              </div>
            )}

            <p className="text-[11px] text-zinc-500">NVIDIA free access and rate limits depend on your account; availability is not guaranteed.</p>

            {mode === "video" && (
              <div>
                <label htmlFor="video-frames" className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Clip length</label>
                <select id="video-frames" value={frames} onChange={(event) => setFrames(Number(event.target.value))} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-800 outline-none focus:border-[#612bd3] dark:border-zinc-700 dark:bg-[#101012] dark:text-zinc-200">
                  <option value={25}>About 1 second · 25 frames</option>
                  <option value={49}>About 2 seconds · 49 frames</option>
                  <option value={73}>About 3 seconds · 73 frames</option>
                </select>
                <p className="mt-1.5 text-[11px] text-zinc-500">Cosmos3 Nano generation can take a few minutes.</p>
              </div>
            )}

            <button type="submit" disabled={generating || saving || !prompt.trim()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#612bd3] px-4 py-3 text-sm font-bold text-white shadow-sm shadow-[#612bd3]/20 transition hover:bg-[#7237e8] disabled:cursor-not-allowed disabled:opacity-60">
              {generating ? <><FiLoader className="animate-spin" aria-hidden="true" /> Generating…</> : <><FiImage aria-hidden="true" /> Generate {mode}</>}
            </button>
          </form>

          {result?.dataUrl && (
            <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Generated result</p>
                <span className="text-[10px] text-zinc-500">{result.model}</span>
              </div>
              {mode === "video" ? (
                <video src={result.dataUrl} controls playsInline className="max-h-[380px] w-full rounded-lg bg-black" aria-label="Generated video preview" />
              ) : (
                <Image src={result.dataUrl} alt="Generated by NVIDIA FLUX.2 Klein 4B" width={1024} height={1024} unoptimized className="max-h-[420px] w-full rounded-lg object-contain" />
              )}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <a href={result.dataUrl} download={downloadName} className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"><FiDownload aria-hidden="true" /> Download</a>
                <button type="button" onClick={handleSaveToLibrary} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
                  {saving ? <FiLoader className="animate-spin" aria-hidden="true" /> : <FiSave aria-hidden="true" />}
                  {saving ? "Saving…" : "Save to Media Library"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(modal, document.body);
}
