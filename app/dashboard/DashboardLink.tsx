"use client";

import { HomeIcon, FileText, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const dashboardLinks = [
    {
        id: 0,
        name: "Dashboard",
        href: "/dashboard",
        icon: HomeIcon,
    },
    {
        id: 1,
        name: "Invoices",
        href: "/dashboard/invoices",
        icon: FileText,
    },
    {
        id: 2,
        name: "Settings",
        href: "/dashboard/settings",
        icon: Settings,
    },
];

export function DashboardLinks() {
    const pathname = usePathname();

    return (
        <>
            {dashboardLinks.map((link) => (
                <Link
                    key={link.id}
                    href={link.href}
                    className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-gray-100",
                        pathname === link.href
                            ? "bg-gray-100 text-gray-900"
                            : "text-gray-600 hover:text-gray-900"
                    )}
                >
                    <link.icon className="h-5 w-5" />
                    {link.name}
                </Link>
            ))}
        </>
    );
}