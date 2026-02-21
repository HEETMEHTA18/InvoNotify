"use server"

import { prisma } from "@/app/utils/db"
import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"
import { isRedirectError } from "next/dist/client/components/redirect-error"

export async function handleRegister(formData: FormData) {
    const name = formData.get("name") as string
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    if (!email || !password) {
        redirect("/register?error=missing_fields")
    }

    try {
        const existingUser = await prisma.user.findUnique({
            where: { email },
        })

        if (existingUser) {
            redirect("/login?error=user_exists")
        }

        const hashedPassword = await bcrypt.hash(password, 10)

        await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
            },
        })

        redirect("/dashboard")
    } catch (error) {
        if (isRedirectError(error)) {
            throw error
        }
        console.error("Registration error:", error)
        redirect("/register?error=registration_failed")
    }
}
