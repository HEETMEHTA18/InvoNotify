import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";

const emailPattern = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$";

export default async function Login({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  const params = (await searchParams) || {};

  const errorMessages = {
    signin_failed: "Invalid email or password",
    db_unavailable: "Database connection error. Please try again later.",
    invalid_email: "Please enter a valid business email format.",
    missing_fields: "Please fill in both email and password.",
    password_too_short: "Password must be at least 8 characters long.",
    password_too_long: "Password is too long.",
    password_weak: "Password must include letters and numbers.",
  };

  const successMessages = {
    registered: "Account created successfully! Please login.",
  };

  const error = params.error;
  const success = params.success;
  const errorMessage = error
    ? errorMessages[error as keyof typeof errorMessages]
    : null;
  const successMessage = success
    ? successMessages[success as keyof typeof successMessages]
    : null;

  return (
    <div className="flex h-screen w-full items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <Link
            href="/"
            className="mb-2 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
          <CardTitle className="text-2xl">Login</CardTitle>
          <CardDescription>
            Enter your email and password to login.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {successMessage && (
            <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {successMessage}
            </div>
          )}
          {errorMessage && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}
          <LoginForm emailPattern={emailPattern} />
          <div className="mt-4 text-center text-sm">
            Don't have an account?{" "}
            <Link href="/register" className="underline">
              Register
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
