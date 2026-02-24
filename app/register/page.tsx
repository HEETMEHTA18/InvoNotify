import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { handleRegister } from "./actions";
import { SubmitButton } from "../components/SubmitButtom";
import Link from "next/link";
import { auth } from "@/app/utils/auth";
import { redirect } from "next/navigation";

export default async function Register({
    searchParams,
}: {
    searchParams: Promise<{ error?: string }>
}) {
    const session = await auth()
    if (session?.user) {
        redirect("/dashboard")
    }

    const params = await searchParams

    const errorMessages = {
        missing_fields: "Please fill in all required fields",
        user_exists: "An account with this email already exists",
        registration_failed: "Registration failed. Please try again",
    }

    const error = params?.error
    const errorMessage = error ? errorMessages[error as keyof typeof errorMessages] : null

    return (
        <div className="flex h-screen w-full items-center justify-center px-4">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle className="text-2xl">Create an Account</CardTitle>
                    <CardDescription>
                        Enter your details to register for Invoice Management.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {errorMessage && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
                            {errorMessage}
                        </div>
                    )}
                    <form action={handleRegister}>
                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Full Name</Label>
                                <Input
                                    id="name"
                                    name="name"
                                    type="text"
                                    placeholder="John Doe"
                                    required
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    placeholder="demo@example.com"
                                    required
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="password">Password</Label>
                                <Input
                                    id="password"
                                    name="password"
                                    type="password"
                                    required
                                />
                            </div>
                            <SubmitButton text="Register" />
                        </div>
                    </form>
                    <div className="mt-4 text-center text-sm">
                        Already have an account?{" "}
                        <Link href="/login" className="underline">
                            Login
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
