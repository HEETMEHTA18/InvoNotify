"use client";

import {
  HomeIcon,
  FileText,
  Settings,
  ShoppingBag,
  Users,
  Bot,
  MessageSquare,
  Brain,
  CreditCard,
  CalendarCheck,
  BarChart3,
} from "lucide-react";
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
    name: "Products",
    href: "/dashboard/products",
    icon: ShoppingBag,
  },
  {
    id: 3,
    name: "Customers",
    href: "/dashboard/customers",
    icon: Users,
  },
  {
    id: 5,
    name: "AI Recovery",
    href: "/dashboard/recovery",
    icon: Bot,
  },
  {
    id: 6,
    name: "Analytics",
    href: "/dashboard/recovery/analytics",
    icon: BarChart3,
  },
  {
    id: 7,
    name: "Credit Scores",
    href: "/dashboard/credit-scores",
    icon: CreditCard,
  },
  {
    id: 8,
    name: "Promises",
    href: "/dashboard/promises",
    icon: CalendarCheck,
  },
  {
    id: 9,
    name: "Diagnosis",
    href: "/dashboard/diagnosis",
    icon: Brain,
  },
  {
    id: 10,
    name: "WhatsApp",
    href: "/dashboard/whatsapp",
    icon: MessageSquare,
  },
  {
    id: 4,
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
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition-all hover:bg-gray-100",
            pathname === link.href
              ? "bg-gray-100 text-gray-900"
              : "text-gray-600 hover:text-gray-900",
          )}
        >
          <link.icon className="h-5 w-5" />
          {link.name}
        </Link>
      ))}
    </>
  );
}
