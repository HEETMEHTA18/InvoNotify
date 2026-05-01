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
import { RegisterForm } from "./RegisterForm";

const emailPattern = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$";

export default async function Register({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  const params = await searchParams;

  const errorMessages = {
    missing_fields: "Please fill in all required fields",
    user_exists: "An account with this email already exists",
    invalid_email: "Please enter a valid business email format",
    invalid_name: "Please enter a valid full name",
    name_too_long: "Name is too long",
    password_too_short: "Password must be at least 8 characters long",
    password_too_long: "Password is too long",
    password_weak: "Password must include letters and numbers",
    registration_failed: "Registration failed. Please try again",
  };

  const error = params?.error;
  const errorMessage = error
    ? errorMessages[error as keyof typeof errorMessages]
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
          <CardTitle className="text-2xl">Create an Account</CardTitle>
          <CardDescription>
            Enter your details to register for Invoice Management.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMessage && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}
          <RegisterForm emailPattern={emailPattern} />
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
