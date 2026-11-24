import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export const maxDuration = 300;

const IMAGE_ENDPOINT = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b";
const VIDEO_ENDPOINT = "https://ai.api.nvidia.com/v1/cosmos/nvidia/cosmos3-nano";
const IMAGE_SIZES = {
  square: [1024, 1024],
  portrait: [768, 1024],
  landscape: [1024, 768],
};
const VIDEO_RESOLUTIONS = {
  "480p": { size: "480", maxFrames: 297 },
  "720p": { size: "720", maxFrames: 197 },
};

async function parseProviderResponse(response) {
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { detail: text };
  }

  if (!response.ok) {
    const message = typeof payload.detail === "string"
      ? payload.detail
      : typeof payload.error === "string"
        ? payload.error
        : "NVIDIA generation request failed.";
    throw Object.assign(new Error(message.slice(0, 400)), { status: response.status });
  }

  return payload;
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Please sign in to generate media." }, { status: 401 });
    }

    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "NVIDIA_API_KEY is not configured." }, { status: 503 });
    }

    const body = await request.json();
    const mode = body.mode;
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

    if (!prompt || prompt.length > 2000) {
      return NextResponse.json({ error: "Prompt must be between 1 and 2,000 characters." }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 240_000);

    try {
      let dataUrl;
      let mimeType;
      let fileExtension;
      let model;

      if (mode === "image") {
        const [width, height] = IMAGE_SIZES[body.aspectRatio] || IMAGE_SIZES.square;
        model = "black-forest-labs/flux.2-klein-4b";

        const response = await fetch(IMAGE_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ prompt, width, height, steps: 4 }),
          signal: controller.signal,
        });
        const result = await parseProviderResponse(response);
        const encodedImage = result.artifacts?.[0]?.base64;
        if (!encodedImage) {
          throw new Error("NVIDIA did not return an image. Please try another prompt.");
        }

        mimeType = result.artifacts?.[0]?.mimeType || "image/png";
        dataUrl = encodedImage.startsWith("data:") ? encodedImage : `data:${mimeType};base64,${encodedImage}`;
        fileExtension = mimeType === "image/jpeg" ? "jpg" : "png";
      } else if (mode === "video") {
        const resolution = VIDEO_RESOLUTIONS[body.resolution] || VIDEO_RESOLUTIONS["480p"];
        const requestedFrames = Number(body.frames);
        const numFrames = [25, 49, 73].includes(requestedFrames) && requestedFrames <= resolution.maxFrames
          ? requestedFrames
          : 25;
        const aspectRatio = ["16_9", "9_16", "1_1"].includes(body.aspectRatio) ? body.aspectRatio : "16_9";
        model = "nvidia/cosmos3-nano";

        const response = await fetch(VIDEO_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            model_mode: "text2video",
            prompt,
            resolution: `${resolution.size}_${aspectRatio}`,
            num_frames: numFrames,
            fps: 24,
            num_inference_steps: 35,
            guidance_scale: 6,
          }),
          signal: controller.signal,
        });
        const result = await parseProviderResponse(response);
        const encodedVideo = result.b64_video;
        if (!encodedVideo) {
          throw new Error("NVIDIA did not return a video. Please try another prompt.");
        }

        mimeType = "video/mp4";
        dataUrl = encodedVideo.startsWith("data:") ? encodedVideo : `data:${mimeType};base64,${encodedVideo}`;
        fileExtension = "mp4";
      } else {
        return NextResponse.json({ error: "Choose image or video generation." }, { status: 400 });
      }

      return NextResponse.json({ success: true, dataUrl, mimeType, fileExtension, model });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    if (error.name === "AbortError") {
      return NextResponse.json({ error: "Generation timed out. Try a shorter prompt or lower video settings." }, { status: 504 });
    }

    console.error("[NVIDIA_MEDIA_GENERATION_ERROR]", error.message);
    const status = Number.isInteger(error.status) ? error.status : 500;
    return NextResponse.json({ error: error.message || "Media generation failed." }, { status });
  }
}
