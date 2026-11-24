import { NextResponse } from "next/server";
import { generateText } from "ai";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { authOptions } from "@/lib/auth";
import { AGENT_MODEL_COOKIE, getConnectedAgentModel } from "@/lib/agent-model-connection";

export const maxDuration = 60;

const PLATFORM_NAMES = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  x_twitter: "X (Twitter)",
  facebook: "Facebook",
  meta_ads: "Meta Ads",
  linkedin: "LinkedIn",
  threads: "Threads",
  pinterest: "Pinterest",
};

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const body = await req.json();
    const cookieStore = await cookies();
    const modelId = getConnectedAgentModel(cookieStore.get(AGENT_MODEL_COOKIE)?.value, session.user);
    let { 
      message, 
      messages = [], 
      history = [], 
      selectedChannels = [], 
      targetChannels = [], 
      threadId 
    } = body;

    // Support targetChannels alias
    const activeChannels = Array.isArray(selectedChannels) && selectedChannels.length > 0 
      ? selectedChannels 
      : (Array.isArray(targetChannels) ? targetChannels : []);

    // If messages array was passed, extract current message and prior history
    if (!message && Array.isArray(messages) && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      message = lastMsg?.content || "";
      if (!history || history.length === 0) {
        history = messages.slice(0, -1);
      }
    }

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Message content cannot be empty." }, { status: 400 });
    }

    if (!modelId) {
      return NextResponse.json({ error: "Connect the free AI model in the Agent workspace before starting the agent." }, { status: 403 });
    }

    // 1. Format the target channel context
    const channelNames = activeChannels.map((k) => PLATFORM_NAMES[k] || k).join(", ");
    const channelContext = channelNames ? `Active Target Channels: ${channelNames}` : "Target Channels: All connected social channels";
    const hasMetaAds = activeChannels.includes("meta_ads");
    const scheduleableChannels = activeChannels.filter((channel) => channel !== "meta_ads");
    const metaOnlySelected = hasMetaAds && scheduleableChannels.length === 0;
    const proposalChannels = scheduleableChannels.length > 0
      ? scheduleableChannels
      : (hasMetaAds ? [] : ["youtube"]);
    const jsonFence = String.fromCharCode(96).repeat(3);
    const outputInstructions = metaOnlySelected
      ? "3. For Meta Ads, draft a campaign concept in prose with objective, primary text, headline, CTA, and an audience hypothesis. Do not return scheduler JSON or claim a campaign was created, launched, or spent budget."
      : `3. When the user asks for social posts, include the explanation and a fenced JSON block for the scheduler. Keep its platform list limited to ${JSON.stringify(proposalChannels)}. If Meta Ads is also selected, describe any ad concept in prose only; do not claim it was launched.`;
    const structuredPostInstructions = metaOnlySelected
      ? ""
      : `STRUCTURED POST FORMAT:\nWhen suggesting a post ready for scheduling, include:\n${jsonFence}json\n${JSON.stringify({
          action: "schedule_post",
          platforms: proposalChannels,
          title: "A captivating, clickable title or headline",
          description: "The complete post text, formatted with clean line breaks and emojis",
          tags: "relevant, comma, separated, hashtags",
        }, null, 2)}\n${jsonFence}`;

    // Keep only recent conversation context to limit prompt size.
    const formattedHistory = (history || [])
      .slice(-10)
      .map((item) => {
        const roleName = item.role === "user" ? "User" : "Agent";
        // Trim each message to keep the request concise.
        const content = typeof item.content === "string" 
          ? (item.content.length > 800 ? item.content.slice(0, 800) + "..." : item.content)
          : "";
        return `${roleName}: ${content}`;
      })
      .join("\n\n");

    const systemPrompt = `You are an elite, highly creative AI Social Media Manager & Marketing Agent for this workspace.
You help creators, founders, and businesses craft viral, high-converting social media content, build multi-channel campaigns, and schedule posts.

${channelContext}

CAPABILITIES & RESPONSIBILITIES:
1. Brainstorm and write platform-tailored social copy (hooks, captions, descriptions, hashtags) respecting each platform's character limits and style (e.g. 280 chars for X, descriptions and tags for YouTube, punchy text for TikTok/Instagram).
2. Remember all context, tone, previous discussion, and brand guidelines shared during this conversation.
3. Treat Meta Ads as a campaign-drafting channel only. Never say that a campaign was created, launched, or spent budget; no campaign publishing flow is connected.
${outputInstructions}

${structuredPostInstructions}

PREVIOUS CONVERSATION HISTORY (Remember these past messages):
${formattedHistory ? formattedHistory : "None (this is the start of the conversation)"}
`;

    const { text: rawOutput } = await generateText({
      model: modelId,
      system: systemPrompt,
      prompt: message.trim(),
      maxOutputTokens: 1200,
      abortSignal: AbortSignal.timeout(45_000),
    });

    if (!rawOutput) {
      return NextResponse.json({ error: "AI agent returned an empty response or timed out. Please check its compatibility and try again." }, { status: 504 });
    }

    // 5. Extract structured post proposal(s) if present in the output
    let postProposal = null;
    let postProposals = [];
    let cleanedReply = rawOutput;

    const jsonMatch = rawOutput.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        const parsedJson = JSON.parse(jsonMatch[1]);
        
        const normalizeProposal = (item) => {
          const platforms = Array.isArray(item.platforms)
            ? item.platforms.filter((platform) => platform !== "meta_ads")
            : [];
          return {
            platforms: platforms.length > 0
              ? platforms
              : (scheduleableChannels.length > 0 ? scheduleableChannels : ["youtube"]),
            title: item.title || "",
            description: item.description || "",
            tags: item.tags || "",
          };
        };

        if (metaOnlySelected) {
          cleanedReply = rawOutput.replace(/```(?:json)?\s*[\s\S]*?\s*```/g, "").trim();
        } else if (Array.isArray(parsedJson) && parsedJson.length > 0) {
          postProposals = parsedJson.map(normalizeProposal);
          postProposal = postProposals[0];
          // Remove the raw JSON block from the conversational reply
          cleanedReply = rawOutput.replace(/```(?:json)?\s*[\s\S]*?\s*```/g, "").trim();
        } else if (parsedJson && (parsedJson.action === "schedule_post" || parsedJson.title || parsedJson.description)) {
          postProposal = normalizeProposal(parsedJson);
          postProposals = [postProposal];
          // Remove the raw JSON block from the conversational reply
          cleanedReply = rawOutput.replace(/```(?:json)?\s*[\s\S]*?\s*```/g, "").trim();
        }
      } catch (err) {
        console.warn("[Agent JSON parse warning]:", err.message);
      }
    }

    return NextResponse.json({
      success: true,
      reply: cleanedReply || (metaOnlySelected
        ? "Meta Ads campaign drafts are available, but campaign creation and launch are not connected."
        : rawOutput),
      postProposal,
      postProposals,
      threadId,
    });
  } catch (error) {
    console.error("[AGENT_CHAT_ERROR]", error);
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred in the Agent." },
      { status: 500 }
    );
  }
}
