"use server"

import { signIn } from "@/app/utils/auth"
import { redirect } from "next/navigation"

export async function handleEmailSignIn(formData: FormData) {
  const email = formData.get("email") as string

  try {
    await signIn("nodemailer", {
      email,
      redirect: false,
    })
    // After sending email, redirect to a verification page
    redirect("/login?verify=true")
  } catch (error) {
    console.error("Sign in error:", error)
    throw error
  }
}
