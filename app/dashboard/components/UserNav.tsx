"use client";
import Link from "next/link";
import { User, LogOut, LayoutDashboard, FileText } from "lucide-react";
import { signOut } from "next-auth/react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserNav() {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 hover:bg-gray-50 transition-colors focus:outline-none ring-offset-white focus-visible:ring-2 focus-visible:ring-gray-950">
                    <User className="h-5 w-5 text-gray-600" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-2 shadow-lg border-gray-200 bg-white">
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">Account Settings</p>
                        <p className="text-xs leading-none text-muted-foreground mt-1">
                            Manage your profile and data
                        </p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="my-2" />
                
                <DropdownMenuItem asChild className="cursor-pointer focus:bg-gray-100 rounded-md transition-colors">
                    <Link href="/dashboard" className="flex w-full items-center gap-2 px-2 py-1.5">
                        <LayoutDashboard className="h-4 w-4 text-gray-400 group-hover:text-gray-900" />
                        <span className="text-sm">Dashboard</span>
                    </Link>
                </DropdownMenuItem>
                
                <DropdownMenuItem asChild className="cursor-pointer focus:bg-gray-100 rounded-md transition-colors">
                    <Link href="/dashboard/invoices" className="flex w-full items-center gap-2 px-2 py-1.5">
                        <FileText className="h-4 w-4 text-gray-400 group-hover:text-gray-900" />
                        <span className="text-sm">Invoices</span>
                    </Link>
                </DropdownMenuItem>
                
                <DropdownMenuItem asChild className="cursor-pointer focus:bg-gray-100 rounded-md transition-colors">
                    <Link href="/dashboard/profile" className="flex w-full items-center gap-2 px-2 py-1.5">
                        <User className="h-4 w-4 text-gray-400 group-hover:text-gray-900" />
                        <span className="text-sm">Profile</span>
                    </Link>
                </DropdownMenuItem>
                
                <DropdownMenuSeparator className="my-2" />
                
                <DropdownMenuItem 
                    className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700 rounded-md transition-colors px-2 py-1.5 flex items-center gap-2"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                >
                    <LogOut className="h-4 w-4" />
                    <span className="text-sm font-medium">Log out</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
