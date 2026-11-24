import { generateText } from "ai";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { isFreeAgentModel } from "@/lib/agent-models";
import { AGENT_MODEL_COOKIE, AGENT_MODEL_COOKIE_MAX_AGE, createAgentModelCookieValue } from "@/lib/agent-model-connection";

export const maxDuration = 30;

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Please sign in before connecting a model." }, { status: 401 });
    }

    const { modelId } = await request.json();
    if (!isFreeAgentModel(modelId)) {
      return NextResponse.json({ error: "Choose an available free model." }, { status: 400 });
    }

    await generateText({
      model: modelId,
      prompt: "Reply with the single word READY.",
      maxOutputTokens: 8,
      abortSignal: AbortSignal.timeout(20_000),
    });

    const response = NextResponse.json({ success: true, modelId });
    response.cookies.set(AGENT_MODEL_COOKIE, createAgentModelCookieValue(session.user, modelId), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api",
      maxAge: AGENT_MODEL_COOKIE_MAX_AGE,
    });
    return response;
  } catch (error) {
    console.error("[AGENT_MODEL_CONNECTION_ERROR]", error.message);
    return NextResponse.json(
      { error: "The free model could not be reached. Check the Vercel AI Gateway connection and try again." },
      { status: 503 }
    );
  }
}
