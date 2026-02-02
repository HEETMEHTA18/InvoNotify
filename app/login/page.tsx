import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { handleEmailSignIn } from "./actions";

export default async function Login({ searchParams }: { searchParams: Promise<{ verify?: string }> })
{
    const params = await searchParams
    const isVerifying = params?.verify === "true"

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
                    {!isVerifying && (
                    <form action={handleEmailSignIn}>
                    <div className="grid gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                placeholder="m@example.com"
                                required
                            />
                        </div>
                        {/* <div className="grid gap-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                name="password"
                                type="password"
                                required
                            />
                        </div> */}
                        <Button type="submit" className="w-full">
                            Sign in
                        </Button>
                    </div>
                    </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
