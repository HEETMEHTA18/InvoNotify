"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export function MobileMenu() {
    const [open, setOpen] = useState(false);

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                    <Menu className="h-6 w-6" />
                </Button>
            </SheetTrigger>
            <SheetContent side="right">
                <div className="flex flex-col gap-6 mt-6">
                    <div className="flex flex-col gap-4">
                        <Link
                            href="#features"
                            className="text-sm font-medium text-gray-600 hover:text-gray-900"
                            onClick={() => setOpen(false)}
                        >
                            Features
                        </Link>
                        <Link
                            href="#how-it-works"
                            className="text-sm font-medium text-gray-600 hover:text-gray-900"
                            onClick={() => setOpen(false)}
                        >
                            How it Works
                        </Link>
                        <Link
                            href="#pricing"
                            className="text-sm font-medium text-gray-600 hover:text-gray-900"
                            onClick={() => setOpen(false)}
                        >
                            Pricing
                        </Link>
                        <Link
                            href="#testimonials"
                            className="text-sm font-medium text-gray-600 hover:text-gray-900"
                            onClick={() => setOpen(false)}
                        >
                            Testimonials
                        </Link>
                    </div>
                    <div className="flex flex-col gap-3">
                        <Link href="/login" className="w-full" onClick={() => setOpen(false)}>
                            <Button variant="outline" className="w-full justify-center">Log in</Button>
                        </Link>
                        <Link href="/login" className="w-full" onClick={() => setOpen(false)}>
                            <Button className="w-full justify-center gap-2 bg-[#596778] hover:bg-[#4a5666]">
                                Get Started
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}
