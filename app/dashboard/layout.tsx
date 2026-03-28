
import Link from "next/link";
import { User, LogOut, LayoutDashboard, FileText, Menu } from "lucide-react";
import { requireUser } from "@/lib/hooks";
import { DashboardLinks } from "./DashboardLink";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { DashboardSidebar } from "./components/DashboardSidebar";
import { UserNav } from "./components/UserNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const session = await requireUser();

    return (
        <div className="flex h-dvh bg-white text-gray-900 overflow-hidden">
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex h-dvh w-64 shrink-0 flex-col border-r border-gray-200 bg-white shadow-sm z-30">
                <DashboardSidebar />
            </aside>

            <div className="flex-1 flex flex-col min-w-0 h-dvh overflow-hidden">
                <header className="flex items-center justify-between border-b border-gray-200 px-3 sm:px-4 md:px-6 py-3 bg-white shrink-0 z-20">
                    {/* Mobile Menu Trigger */}
                    <div className="md:hidden flex items-center gap-2 sm:gap-4 min-w-0">
                        <Sheet>
                            <SheetTrigger asChild>
                                <Button variant="ghost" size="icon" className="md:hidden">
                                    <Menu className="h-5 w-5" />
                                    <span className="sr-only">Toggle menu</span>
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="left" className="p-0 bg-white w-[85vw] max-w-64">
                                <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                                <DashboardSidebar />
                            </SheetContent>
                        </Sheet>
                        <Link href="/dashboard" className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white font-bold">
                                <FileText className="h-4 w-4 text-white" />
                            </div>
                            <span className="text-lg font-bold text-gray-900">Invonotify</span>
                        </Link>
                    </div>

                    <div className="flex items-center ml-auto gap-2 sm:gap-4">
                        <UserNav />
                    </div>
                </header>
                <main className="flex-1 min-h-0 bg-gray-50 overflow-y-auto p-3 sm:p-4 md:p-6 lg:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
