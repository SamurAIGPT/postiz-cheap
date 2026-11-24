import "server-only";
import { headers } from "next/headers";
import {
  getToken,
  revokeToken,
  startAuthorization,
  UserAuthorizationRequiredError,
} from "@vercel/connect";

export const META_ADS_CONNECTOR_UID = "facebook.com/meta-ads-accounts";
export const META_ADS_PLATFORM_ID = 9;
export const META_ADS_SCOPES = ["ads_read"];
const META_GRAPH_ORIGIN = "https://graph.facebook.com";
const META_GRAPH_VERSION = "v27.0";

export { UserAuthorizationRequiredError };

function getSubject(session) {
  const userId = session?.user?.id;
  if (typeof userId !== "string" || !userId) {
    throw new Error("A stable signed-in user ID is required for Meta Ads authorization.");
  }

  return { type: "user", id: userId, issuer: "postiz-cheap-nextauth" };
}

export async function isSameOriginMetaRequest() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host = (requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "")
    .split(",")[0]
    .trim();
  if (!origin || !host || /[\r\n/\\]/.test(host)) return false;

  const protocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim()
    || (host.startsWith("localhost") ? "http" : "https");
  try {
    return new URL(origin).origin === new URL(`${protocol}://${host}`).origin;
  } catch {
    return false;
  }
}

async function getCallbackOrigin() {
  if (process.env.NODE_ENV !== "production" && process.env.V0_RUNTIME_URL) {
    return new URL(process.env.V0_RUNTIME_URL).origin;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`).origin;
  }
  if (process.env.VERCEL_URL) {
    return new URL(`https://${process.env.VERCEL_URL}`).origin;
  }

  const requestHeaders = await headers();
  const host = (requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "")
    .split(",")[0]
    .trim();
  if (!host || /[\r\n/\\]/.test(host)) {
    throw new Error("Unable to determine the application callback origin.");
  }

  const protocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim()
    || (host.startsWith("localhost") ? "http" : "https");
  return new URL(`${protocol}://${host}`).origin;
}

export async function startMetaAdsAuthorization(session) {
  const origin = await getCallbackOrigin();
  const authorization = await startAuthorization(
    META_ADS_CONNECTOR_UID,
    { subject: getSubject(session), scopes: META_ADS_SCOPES },
    { callbackUrl: `${origin}/integrations?meta=connected` }
  );

  return authorization.url;
}

export async function getMetaAdsAccessToken(session) {
  return getToken(META_ADS_CONNECTOR_UID, {
    subject: getSubject(session),
    scopes: META_ADS_SCOPES,
  });
}

export async function listMetaAdAccounts(session) {
  const accessToken = await getMetaAdsAccessToken(session);
  const accounts = [];
  const firstPage = new URL(`${META_GRAPH_ORIGIN}/${META_GRAPH_VERSION}/me/adaccounts`);
  firstPage.searchParams.set("fields", "id,name,account_status,currency,timezone_name");
  firstPage.searchParams.set("limit", "100");

  let nextPageUrl = firstPage.toString();
  for (let page = 0; nextPageUrl && page < 10; page += 1) {
    const pageUrl = new URL(nextPageUrl);
    if (pageUrl.origin !== META_GRAPH_ORIGIN) {
      throw new Error("Meta returned an unexpected pagination URL.");
    }

    const response = await fetch(pageUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(payload?.data)) {
      throw new Error("Meta Ads could not return ad accounts. Verify the app permissions and account access.");
    }

    accounts.push(...payload.data);
    nextPageUrl = payload.paging?.next || "";
  }

  return accounts.map((account) => ({
    id: `meta_ads:${account.id}`,
    platform: META_ADS_PLATFORM_ID,
    platform_name: "meta_ads",
    account_name: account.name || account.id,
    platform_user_id: account.id,
    account_status: account.account_status,
    currency: account.currency,
    timezone_name: account.timezone_name,
  }));
}

export async function disconnectMetaAds(session) {
  await revokeToken(META_ADS_CONNECTOR_UID, { subject: getSubject(session) });
}
