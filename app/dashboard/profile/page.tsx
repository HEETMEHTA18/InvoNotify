import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/hooks";

export default async function ProfilePage() {
  const session = await requireUser();
  const email = session.user?.email ?? "Unavailable";

  return (
    <div className="max-w-xl mx-auto py-10">
      <Card className="p-8">
        <h1 className="text-2xl font-bold mb-4">Profile</h1>
        <div className="mb-2">
          <span className="font-semibold">Email:</span> {email}
        </div>
        {/* Add more user info here if needed */}
      </Card>
    </div>
  );
}
