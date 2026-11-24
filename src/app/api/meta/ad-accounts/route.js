import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  listMetaAdAccounts,
  UserAuthorizationRequiredError,
} from "@/lib/integrations/meta-ads";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to view Meta ad accounts." }, { status: 401 });
  }

  try {
    const accounts = await listMetaAdAccounts(session);
    return NextResponse.json({ connected: true, accounts });
  } catch (error) {
    if (error instanceof UserAuthorizationRequiredError) {
      return NextResponse.json({ connected: false, authorizationRequired: true, accounts: [] });
    }

    console.error("[META_ADS_ACCOUNTS_ERROR]", error?.name || "UnknownError");
    return NextResponse.json(
      {
        connected: false,
        authorizationRequired: false,
        accounts: [],
        error: "Could not load Meta ad accounts. Check the granted permissions and account access.",
      },
      { status: 502 }
    );
  }
}
