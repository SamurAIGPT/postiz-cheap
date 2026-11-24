import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  disconnectMetaAds,
  isSameOriginMetaRequest,
  startMetaAdsAuthorization,
  UserAuthorizationRequiredError,
} from "@/lib/integrations/meta-ads";

export async function POST() {
  if (!(await isSameOriginMetaRequest())) {
    return NextResponse.json({ error: "Cross-origin request denied." }, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in before connecting a Meta Ads account." }, { status: 401 });
  }

  try {
    const url = await startMetaAdsAuthorization(session);
    return NextResponse.json({ url });
  } catch (error) {
    console.error("[META_ADS_AUTH_START_ERROR]", error?.name || "UnknownError");
    return NextResponse.json(
      { error: "Meta authorization could not be started. Check the Vercel Connect setup and Meta permissions." },
      { status: 502 }
    );
  }
}

export async function DELETE() {
  if (!(await isSameOriginMetaRequest())) {
    return NextResponse.json({ error: "Cross-origin request denied." }, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in before disconnecting Meta Ads." }, { status: 401 });
  }

  try {
    await disconnectMetaAds(session);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof UserAuthorizationRequiredError) {
      return NextResponse.json({ success: true });
    }

    console.error("[META_ADS_DISCONNECT_ERROR]", error?.name || "UnknownError");
    return NextResponse.json({ error: "Meta Ads could not be disconnected. Please try again." }, { status: 502 });
  }
}
