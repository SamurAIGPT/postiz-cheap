import { createHmac, timingSafeEqual } from "node:crypto";
import { isFreeAgentModel } from "@/lib/agent-models";

export const AGENT_MODEL_COOKIE = "v0-agent-model";
export const AGENT_MODEL_COOKIE_MAX_AGE = 60 * 60 * 12;

function getUserIdentity(user) {
  const identity = typeof user?.id === "string" ? user.id : user?.email;
  return typeof identity === "string" && identity ? identity.toLowerCase() : "";
}

function signPayload(payload) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required to sign the model connection.");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createAgentModelCookieValue(user, modelId) {
  const subject = getUserIdentity(user);
  if (!subject || !isFreeAgentModel(modelId)) {
    throw new Error("The signed-in user or free model is invalid.");
  }

  const payload = Buffer.from(JSON.stringify({
    sub: subject,
    modelId,
    exp: Math.floor(Date.now() / 1000) + AGENT_MODEL_COOKIE_MAX_AGE,
  })).toString("base64url");

  return `${payload}.${signPayload(payload)}`;
}

export function getConnectedAgentModel(cookieValue, user) {
  if (typeof cookieValue !== "string") return null;
  const [payload, signature, extra] = cookieValue.split(".");
  if (!payload || !signature || extra || !getUserIdentity(user)) return null;

  try {
    const expected = Buffer.from(signPayload(payload));
    const supplied = Buffer.from(signature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

    const connection = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      connection.sub !== getUserIdentity(user) ||
      !Number.isInteger(connection.exp) || connection.exp <= Math.floor(Date.now() / 1000) ||
      !isFreeAgentModel(connection.modelId)
    ) return null;

    return connection.modelId;
  } catch {
    return null;
  }
}
