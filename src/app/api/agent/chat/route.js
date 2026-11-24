import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import config from "@/lib/config";

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

function isPrivateIpv4(hostname) {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return octets[0] === 10 || octets[0] === 127 ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    octets[0] === 0;
}

function validateExternalEndpoint(value) {
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    return false;
  }

  const hostname = endpoint.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isPrivateIpv6 = hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80:");
  return endpoint.protocol === "https:" && !endpoint.username && !endpoint.password &&
    !hostname.endsWith(".localhost") && !hostname.endsWith(".local") &&
    !hostname.endsWith(".internal") && hostname !== "localhost" &&
    !isPrivateIpv4(hostname) && !isPrivateIpv6;
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const body = await req.json();
    const providerConfig = body.providerConfig;
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

    const usesExternalAgent = providerConfig !== null && providerConfig !== undefined;
    if (usesExternalAgent) {
      if (
        typeof providerConfig.endpoint !== "string" || providerConfig.endpoint.length > 2048 ||
        !validateExternalEndpoint(providerConfig.endpoint) ||
        typeof providerConfig.model !== "string" || !providerConfig.model.trim() || providerConfig.model.length > 200 ||
        typeof providerConfig.apiKey !== "string" || !providerConfig.apiKey.trim() || providerConfig.apiKey.length > 4096
      ) {
        return NextResponse.json({ error: "External agent settings are invalid. Use a public HTTPS Chat Completions endpoint, model, and API key." }, { status: 400 });
      }
    } else if (!config.ai.apiKey) {
      return NextResponse.json(
        { error: "MuAPI API key is not configured. Please check MUAPIAPP_API_KEY in .env." },
        { status: 500 }
      );
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

    // 2. Format conversation history into system_prompt so gpt-5-mini remembers previous messages
    // Strictly limited to last 10 messages to minimize credit consumption
    const formattedHistory = (history || [])
      .slice(-10)
      .map((item) => {
        const roleName = item.role === "user" ? "User" : "Agent";
        // Trim each message to max 800 chars to prevent credit bloat
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

    let rawOutput = null;

    if (usesExternalAgent) {
      const externalResponse = await fetch(providerConfig.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${providerConfig.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model: providerConfig.model.trim(),
          messages: [
            { role: "system", content: systemPrompt },
            ...(Array.isArray(history) ? history.slice(-10).map((item) => ({
              role: item.role === "assistant" ? "assistant" : "user",
              content: typeof item.content === "string" ? item.content.slice(0, 800) : "",
            })) : []),
            { role: "user", content: message.trim() },
          ],
        }),
        redirect: "error",
        signal: AbortSignal.timeout(45_000),
      });

      if (!externalResponse.ok) {
        return NextResponse.json({ error: `External agent request failed (${externalResponse.status}). Check the endpoint, model, and API key.` }, { status: 502 });
      }

      const externalData = await externalResponse.json();
      const content = externalData.choices?.[0]?.message?.content;
      rawOutput = typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.map((part) => part.text || "").join("\n")
          : "";
    } else {
      const apiKey = config.ai.apiKey;

      // Submit generation request to MuAPI gpt-5-mini
      const submitRes = await fetch("https://api.muapi.ai/api/v1/gpt-5-mini", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          prompt: message.trim(),
          system_prompt: systemPrompt,
        }),
      });

      if (!submitRes.ok) {
        const errText = await submitRes.text().catch(() => "");
        console.error("[MuAPI Agent gpt-5-mini Error]:", submitRes.status, errText);
        return NextResponse.json(
          { error: `AI agent submission failed: ${errText || submitRes.statusText}` },
          { status: submitRes.status }
        );
      }

      const submitData = await submitRes.json();
      const requestId = submitData.request_id || submitData.id;

      if (!requestId) {
        return NextResponse.json({ error: "No request ID returned from AI provider." }, { status: 502 });
      }

      // Poll for prediction result
      const maxAttempts = 30;
      let attempts = 0;

      while (attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1500));
        attempts++;

        try {
          const pollRes = await fetch(`https://api.muapi.ai/api/v1/predictions/${requestId}/result`, {
            headers: { "x-api-key": apiKey },
          });

          if (pollRes.ok) {
            const pollData = await pollRes.json();
            if (pollData.status === "completed" || pollData.status === "succeeded") {
              if (Array.isArray(pollData.outputs) && pollData.outputs.length > 0) {
                rawOutput = pollData.outputs[0];
              } else if (pollData.output) {
                rawOutput = typeof pollData.output === "string" ? pollData.output : JSON.stringify(pollData.output);
              } else if (pollData.result) {
                rawOutput = typeof pollData.result === "string" ? pollData.result : JSON.stringify(pollData.result);
              }
              break;
            }
            if (pollData.status === "failed") throw new Error(pollData.error || "Agent generation failed during processing.");
          }
        } catch (pollErr) {
          console.warn(`[MuAPI Agent Poll Attempt ${attempts} Error]:`, pollErr.message);
        }
      }
    }

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
