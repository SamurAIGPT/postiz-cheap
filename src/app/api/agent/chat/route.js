import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { authOptions } from "@/lib/auth";
import { AGENT_MODEL_COOKIE, getConnectedAgentModel } from "@/lib/agent-model-connection";
import { generateAgentResponse } from "@/lib/agent-models";

export const maxDuration = 60;

const PLATFORM_NAMES = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  x_twitter: "X",
  facebook: "Facebook",
  meta_ads: "Meta Ads",
  linkedin: "LinkedIn",
  threads: "Threads",
  pinterest: "Pinterest",
};

const PLATFORM_KEYS = new Set(Object.keys(PLATFORM_NAMES));

function formatHistory(history) {
  if (!Array.isArray(history)) return "No earlier messages.";

  const entries = history.slice(-8).map((item) => {
    const role = item?.role === "user" ? "User" : "Agent";
    const content = typeof item?.content === "string" ? item.content.trim().slice(0, 500) : "";
    return content ? `${role}: ${content}` : "";
  }).filter(Boolean);

  return entries.length > 0 ? entries.join("\n") : "No earlier messages.";
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const body = await req.json();
    const cookieStore = await cookies();
    const modelId = getConnectedAgentModel(cookieStore.get(AGENT_MODEL_COOKIE)?.value, session.user);
    const messageList = Array.isArray(body.messages) ? body.messages : [];
    let message = body.message;
    let history = Array.isArray(body.history) ? body.history : [];

    if (!message && messageList.length > 0) {
      message = messageList.at(-1)?.content || "";
      if (history.length === 0) history = messageList.slice(0, -1);
    }

    if (typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Message content cannot be empty." }, { status: 400 });
    }
    if (message.length > 2000) {
      return NextResponse.json({ error: "Keep each request under 2,000 characters." }, { status: 400 });
    }
    if (!modelId) {
      return NextResponse.json({ error: "Connect the AI model in the Agent workspace before starting the agent." }, { status: 403 });
    }

    const channelInput = Array.isArray(body.selectedChannels) && body.selectedChannels.length > 0
      ? body.selectedChannels
      : Array.isArray(body.targetChannels) ? body.targetChannels : [];
    const activeChannels = [...new Set(channelInput.filter((channel) => typeof channel === "string" && PLATFORM_KEYS.has(channel)))];

    if (activeChannels.length === 0) {
      return NextResponse.json({
        success: true,
        reply: "Which channel should I prepare this for? Select one or more channels on the left, then send your request again.",
        postProposal: null,
        postProposals: [],
        needsClarification: true,
        threadId: body.threadId,
      });
    }

    const scheduleableChannels = activeChannels.filter((channel) => channel !== "meta_ads");
    const metaOnlySelected = activeChannels.includes("meta_ads") && scheduleableChannels.length === 0;
    const channelNames = activeChannels.map((channel) => PLATFORM_NAMES[channel]).join(", ");
    const conversationHistory = formatHistory(history);

    const instructions = `You are a practical social media writing assistant. Help the user finish the task they asked for, without turning it into a marketing lesson.

Selected channels: ${channelNames}.
Conversation context (use it for brand, audience, offer, and tone; do not repeat it back):
${conversationHistory}

Behavior:
- Keep the visible reply to one short sentence. Do not include a long introduction, strategy essay, unsolicited list of hooks, monthly framework, markdown table, or raw JSON.
- For a post request, return ready-to-use drafts in postProposals. Create one platform-specific draft for each selected non-ad channel unless the user asks for a different count. Never assign a draft to a channel the user did not select.
- Tailor each draft to its platform. Use a clear hook, natural concise copy, a relevant call to action only when appropriate, and up to 4 relevant hashtags. Do not invent offers, testimonials, scarcity, facts, or guaranteed results.
- Create calendars, multiple variations, video scripts, or a content strategy only when the user explicitly requests them. Return no more than 9 post proposals per response.
- Ask one concise clarifying question only if a useful, accurate draft cannot be made from the request and conversation history. Set needsClarification to true and return no proposals when asking.
- For ordinary questions, answer directly in reply and return no proposals.
- Never claim anything was scheduled, published, or launched. Scheduling always requires the user's review in the composer.
${metaOnlySelected
    ? "Meta Ads is the only selected channel. Provide a concise campaign draft in reply if requested, but no scheduler post proposals and never claim the campaign was launched."
    : activeChannels.includes("meta_ads")
      ? "Meta Ads is also selected, but social post proposals must target only the selected non-ad channels. Do not claim an ad campaign was launched."
      : ""}`;

    const response = await generateAgentResponse({
      modelId,
      instructions,
      prompt: message.trim(),
      maxOutputTokens: 900,
      abortSignal: AbortSignal.timeout(45_000),
    });

    const allowedChannels = new Set(scheduleableChannels);
    const postProposals = metaOnlySelected || response.needsClarification
      ? []
      : response.postProposals.map((proposal) => ({
          ...proposal,
          platforms: proposal.platforms.filter((platform) => allowedChannels.has(platform)).slice(0, 1),
        })).filter((proposal) => proposal.platforms.length > 0);
    const reply = response.needsClarification
      ? response.reply
      : response.reply || (postProposals.length > 0 ? "Your drafts are ready to review below." : "How else can I help with your social content?");

    return NextResponse.json({
      success: true,
      reply,
      postProposal: postProposals[0] || null,
      postProposals,
      needsClarification: response.needsClarification,
      threadId: body.threadId,
    });
  } catch (error) {
    console.error("[AGENT_CHAT_ERROR]", error);
    const status = Number.isInteger(error.status)
      ? error.status
      : error.name === "AbortError" || error.name === "TimeoutError"
        ? 504
        : 500;
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred in the Agent." },
      { status }
    );
  }
}
