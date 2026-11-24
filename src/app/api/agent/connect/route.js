import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { testAgentModel } from "@/lib/agent-models";
import { isSupportedAgentModel } from "@/lib/agent-model-config";
import { AGENT_MODEL_COOKIE, AGENT_MODEL_COOKIE_MAX_AGE, createAgentModelCookieValue, getConnectedAgentModel } from "@/lib/agent-model-connection";
import { cookies } from "next/headers";

export const maxDuration = 30;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Please sign in before connecting a model." }, { status: 401 });
  }

  const cookieStore = await cookies();
  const modelId = getConnectedAgentModel(cookieStore.get(AGENT_MODEL_COOKIE)?.value, session.user);
  return NextResponse.json({ connected: Boolean(modelId), modelId });
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Please sign in before connecting a model." }, { status: 401 });
    }

    const { modelId } = await request.json();
    if (!isSupportedAgentModel(modelId)) {
      return NextResponse.json({ error: "Choose a supported NVIDIA writing model." }, { status: 400 });
    }

    await testAgentModel({ modelId, abortSignal: AbortSignal.timeout(20_000) });

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
    const status = Number.isInteger(error.status)
      ? error.status
      : error.name === "AbortError" || error.name === "TimeoutError"
        ? 504
        : 503;
    return NextResponse.json(
      { error: error.message || "The AI model could not be reached. Please try again." },
      { status }
    );
  }
}
