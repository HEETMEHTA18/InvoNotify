"use server"

import { signIn } from "@/app/utils/auth"
import { redirect } from "next/navigation"
import { isRedirectError } from "next/dist/client/components/redirect-error"
import { Prisma } from "@prisma/client"

export async function handleEmailSignIn(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  try {
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/dashboard",
    });
    if (result?.error) {
      redirect("/login?error=signin_failed");
    }
    if (result?.url) {
      redirect(result.url);
    }
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    if (
      error instanceof Prisma.PrismaClientInitializationError ||
      (error instanceof Error &&
        typeof error.message === "string" &&
        error.message.includes("AdapterError"))
    ) {
      redirect("/login?error=db_unavailable");
    }
    console.error("Sign in error:", error);
    redirect("/login?error=signin_failed");
  }
}

export async function handleGoogleSignIn() {
  try {
    await signIn("google", { redirectTo: "/dashboard" })
  } catch (error) {
    if (isRedirectError(error)) {
      throw error
    }
    console.error("Google sign in error:", error)
    redirect("/login?error=signin_failed")
  }
}
