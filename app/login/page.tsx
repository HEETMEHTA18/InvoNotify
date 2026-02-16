import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { handleEmailSignIn } from "./actions";
import { auth } from "@/app/utils/auth";
import { redirect } from "next/navigation";
import { SubmitButton } from "../components/SubmitButtom";

export default async function Login({
    searchParams,
}: {
    searchParams: Promise<{ verify?: string; error?: string }>
})
{
    const session = await auth()
    if (session?.user) {
        redirect("/dashboard")
    }

    const params = await searchParams
    const isVerifying = params?.verify === "true"
    const errorMessage =
        params?.error === "db_unavailable"
            ? "Sign-in is temporarily unavailable because the database connection failed. Check DATABASE_URL and Neon status, then try again."
            : params?.error === "signin_failed"
            ? "Sign-in failed. Please try again."
            : null

    return (
        <div className="flex h-screen w-full items-center justify-center px-4">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle className="text-2xl">Login</CardTitle>
                    <CardDescription>
                        {isVerifying
                            ? "Check your email for the magic link to sign in."
                            : "Enter your email to receive a magic link."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {errorMessage ? (
                        <p className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {errorMessage}
                        </p>
                    ) : null}
                    {!isVerifying && (
                    <form action={handleEmailSignIn}>
                    <div className="grid gap-4">
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
                        {/* <Button type="submit" className="w-full">
                            Sign in
                        </Button> */}

                        <SubmitButton />
                    </div>
                    </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
