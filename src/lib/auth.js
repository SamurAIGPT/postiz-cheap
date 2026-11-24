import { PrismaAdapter } from "@next-auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";

const PRIVATE_WORKSPACE_OWNER_EMAIL = "s80891433@gmail.com";

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  providers: [
    CredentialsProvider({
      id: "private-workspace",
      name: "Private Workspace",
      credentials: {},
      async authorize() {
        const user = await prisma.user.findUnique({
          where: { email: PRIVATE_WORKSPACE_OWNER_EMAIL },
        });

        if (!user) return null;

        return {
          id: user.id,
          name: user.name || "Private Workspace",
          email: user.email,
          image: user.image,
          credits: user.credits,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.credits = user.credits ?? 10;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id || token.sub;
        session.user.credits = token.credits ?? 10;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
};

