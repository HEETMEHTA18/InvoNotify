"use server"

import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"
import { isRedirectError } from "next/dist/client/components/redirect-error"

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

export async function handleRegister(formData: FormData) {
    const name = formData.get("name") as string
    const email = (formData.get("email") as string)?.trim().toLowerCase()
    const password = formData.get("password") as string

    if (!email || !password || !name) {
        redirect("/register?error=missing_fields")
    }

    if (!STRICT_EMAIL_REGEX.test(email)) {
        redirect("/register?error=invalid_email")
    }

    if (name.trim().length < 2) {
        redirect("/register?error=invalid_name")
    }

    if (name.trim().length > 80) {
        redirect("/register?error=name_too_long")
    }

    const passwordError = validatePassword(password)
    if (passwordError) {
        redirect(`/register?error=${passwordError}`)
    }

    try {
        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email },
        })

        if (existingUser) {
            redirect("/register?error=user_exists")
        }

        // Hash password and create user
        const hashedPassword = await bcrypt.hash(password, 10)

        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
            },
        })

        console.log("✅ User created successfully:", newUser.email)

        // Redirect to login page with success message
        redirect("/login?success=registered")
    } catch (error) {
        if (isRedirectError(error)) {
            throw error
        }
        console.error("❌ Registration error details:", error)
        if (error instanceof Error) {
            console.error("Error message:", error.message)
            console.error("Error stack:", error.stack)
        }
        redirect("/register?error=registration_failed")
    }
}
