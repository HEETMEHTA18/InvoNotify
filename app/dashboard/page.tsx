import { auth } from "@/app/utils/auth"
import { redirect } from "next/navigation"

export default async function DashboardRoute() {
    const session = await auth()

    if (!session?.user) {
        redirect("/login")
    }

    return (
        <div className="flex h-screen w-full items-center justify-center px-4">
            <h1 className="text-3xl font-bold">Welcome to the Dashboard</h1>
        </div>
    );
}
