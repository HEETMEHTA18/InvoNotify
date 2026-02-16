"use server"

import { signIn } from "@/app/utils/auth"
import { redirect } from "next/navigation"
import { isRedirectError } from "next/dist/client/components/redirect-error"
import { Prisma } from "@prisma/client"

export async function handleEmailSignIn(formData: FormData) {
  const email = formData.get("email") as string

  try {
    await signIn("nodemailer", {
      email,
      callbackUrl: "/dashboard",
      redirect: false,
    })
  } catch (error) {
    if (isRedirectError(error)) {
      throw error
    }

    if (
      error instanceof Prisma.PrismaClientInitializationError ||
      (error instanceof Error &&
        typeof error.message === "string" &&
        error.message.includes("AdapterError"))
    ) {
      redirect("/login?error=db_unavailable")
    }

    console.error("Sign in error:", error)
    redirect("/login?error=signin_failed")
  }

  redirect("/verify")
}
