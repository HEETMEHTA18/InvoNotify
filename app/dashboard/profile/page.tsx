"use client";

import { useSession } from "next-auth/react";
import { Card } from "@/components/ui/card";

export default function ProfilePage() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <div>Loading...</div>;
  }

  if (!session?.user) {
    return <div>You are not logged in.</div>;
  }

  return (
    <div className="max-w-xl mx-auto py-10">
      <Card className="p-8">
        <h1 className="text-2xl font-bold mb-4">Profile</h1>
        <div className="mb-2">
          <span className="font-semibold">Email:</span> {session.user.email}
        </div>
        {/* Add more user info here if needed */}
      </Card>
    </div>
  );
}
