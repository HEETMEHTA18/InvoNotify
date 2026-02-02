import { PrismaAdapter } from "@auth/prisma-adapter"
import NextAuth from "next-auth"
import Nodemailer from "next-auth/providers/nodemailer"
import { prisma } from "./db"
export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
     Nodemailer({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: process.env.EMAIL_SERVER_PORT,
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
    }),
  ],
  pages: {
    signIn: "/login",
    verifyRequest: "/login",
    newUser: "/dashboard",
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      // Always redirect to dashboard after email verification
      if (url.includes("callbackUrl")) {
        const urlObj = new URL(url)
        const callbackUrl = urlObj.searchParams.get("callbackUrl")
        if (callbackUrl) {
          return callbackUrl
        }
      }

      // Default redirect to dashboard
      if (url.startsWith("/")) return `${baseUrl}${url}`
      if (new URL(url).origin === baseUrl) return url
      return `${baseUrl}/dashboard`
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
      }
      return session
    },
  },
})
