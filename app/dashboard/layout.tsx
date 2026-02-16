import Link from "next/link";
import { User, LogOut, LayoutDashboard, FileText } from "lucide-react";
import { requireUser } from "../utils/hooks";
import { DashboardLinks } from "./DashboardLink";
import { signOut } from "../utils/auth";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const session = await requireUser();

    return (
        <div className="flex h-screen bg-white text-gray-900">
            <aside className="w-64 border-r border-gray-200 bg-white p-4">
                <Link href="/dashboard" className="flex items-center gap-2 mb-8 px-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900 text-white font-bold">
                        <FileText className="h-6 w-6 text-white" />
                    </div>
                    <span className="text-xl font-bold">
                        <span className="text-gray-900">IMS</span>
                    </span>
                </Link>

                <nav className="space-y-1">
                    <DashboardLinks />
                </nav>
            </aside>
            <div className="flex-1 flex flex-col">
                <header className="flex items-center justify-end border-b border-gray-200 px-6 py-3">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 hover:bg-gray-50 transition-colors">
                                <User className="h-5 w-5 text-gray-600" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>My Account</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                                <Link href="/dashboard" className="flex items-center gap-2 cursor-pointer">
                                    <LayoutDashboard className="h-4 w-4" />
                                    Dashboard
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <Link href="/dashboard/invoices" className="flex items-center gap-2 cursor-pointer">
                                    <FileText className="h-4 w-4" />
                                    Invoices
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                                <form
                                    action={async () => {
                                        "use server";
                                        await signOut();
                                    }}
                                >
                                    <button type="submit" className="flex items-center gap-2 w-full text-left">
                                        <LogOut className="h-4 w-4" />
                                        Log out
                                    </button>
                                </form>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </header>
                <main className="flex-1 p-6 bg-gray-50">
                    {children}
                </main>
            </div>
        </div>
    );
}
