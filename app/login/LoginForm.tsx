"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/SubmitButton";
import { handleEmailSignIn } from "./actions";
import { Eye, EyeOff } from "lucide-react";

type Props = {
  emailPattern: string;
};

export function LoginForm({ emailPattern }: Props) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={handleEmailSignIn} noValidate>
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="demo@example.com"
            pattern={emailPattern}
            title="Use a valid email address like name@company.com"
            autoComplete="email"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              minLength={8}
              maxLength={128}
              autoComplete="current-password"
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-gray-800"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Password must be at least 8 characters and include letters and numbers.
          </p>
        </div>
        <SubmitButton text="Login" />
      </div>
    </form>
  );
}
