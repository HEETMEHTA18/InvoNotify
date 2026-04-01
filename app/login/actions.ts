"use server"

import { signIn } from "@/lib/auth"
import { redirect } from "next/navigation"
import { isRedirectError } from "next/dist/client/components/redirect-error"
import { Prisma } from "@/lib/db"

const STRICT_EMAIL_REGEX = /^(?=.{6,254}$)(?=.{1,64}@)(?=[A-Za-z])[A-Za-z0-9._%+-]*[A-Za-z][A-Za-z0-9._%+-]*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/

export async function handleEmailSignIn(formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!STRICT_EMAIL_REGEX.test(email)) {
    redirect("/login?error=invalid_email")
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    });
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
