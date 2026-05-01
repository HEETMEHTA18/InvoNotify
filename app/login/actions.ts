"use server"

import { signIn } from "@/lib/auth"
import { redirect } from "next/navigation"
import { isRedirectError } from "next/dist/client/components/redirect-error"
import { Prisma } from "@/lib/db"

const STRICT_EMAIL_REGEX = /^(?=.{6,254}$)(?=.{1,64}@)(?=[A-Za-z])[A-Za-z0-9._%+-]*[A-Za-z][A-Za-z0-9._%+-]*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/
const MIN_PASSWORD_LENGTH = 8

function validatePassword(password: string) {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return "password_too_short"
  }
  if (password.length > 128) {
    return "password_too_long"
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "password_weak"
  }
  return null
}

export async function handleEmailSignIn(formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!email || !password) {
    redirect("/login?error=missing_fields")
  }

  if (!STRICT_EMAIL_REGEX.test(email)) {
    redirect("/login?error=invalid_email")
  }

  const passwordError = validatePassword(password)
  if (passwordError) {
    redirect(`/login?error=${passwordError}`)
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
