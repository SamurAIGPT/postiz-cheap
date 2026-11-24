import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const platformIds = {
  youtube: 1,
  tiktok: 2,
  instagram: 3,
  x_twitter: 4,
  facebook: 5,
  linkedin: 6,
  threads: 7,
  pinterest: 8,
};

const DraftSchema = z.object({
  platforms: z.array(z.enum(Object.keys(platformIds))).length(1),
  title: z.string().max(120),
  description: z.string().max(2400),
  tags: z.string().max(300),
});

const RequestSchema = z.object({
  proposals: z.array(DraftSchema).min(1).max(30),
});

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Drafts must include 1–30 valid social posts." }, { status: 400 });
    }

    const drafts = await prisma.$transaction(
      parsed.data.proposals.map((proposal, index) => {
        const platform = proposal.platforms[0];
        const suggestedDate = new Date();
        suggestedDate.setUTCHours(14, 0, 0, 0);
        suggestedDate.setUTCDate(suggestedDate.getUTCDate() + index + 1);
        return prisma.scheduledPost.create({
          data: {
            userId: session.user.id,
            accountId: platformIds[platform],
            platform,
            accountName: "Draft",
            mediaUrl: "",
            title: proposal.title,
            description: proposal.description,
            tags: proposal.tags,
            scheduledAt: suggestedDate,
            status: "draft",
          },
        });
      })
    );

    return NextResponse.json({ drafts }, { status: 201 });
  } catch (error) {
    console.error("[AGENT_DRAFTS_ERROR]", error);
    return NextResponse.json({ error: "The drafts could not be saved. Please try again." }, { status: 500 });
  }
}
