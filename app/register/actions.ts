"use server"

import { prisma } from "@/app/utils/db"
import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"
import { isRedirectError } from "next/dist/client/components/redirect-error"

export async function handleRegister(formData: FormData) {
    const name = formData.get("name") as string
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    if (!email || !password || !name) {
        redirect("/register?error=missing_fields")
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
