import Link from "next/link";
import Image from "next/image";
import { DashboardLinks } from "@/components/dashboard/DashboardLink";

export function DashboardSidebar() {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center gap-2 p-6 pb-2">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
            <Image
              src="/icon.png"
              alt="Invonotify logo"
              width={24}
              height={24}
              className="h-6 w-6 object-contain"
              priority
            />
          </div>
          <span className="text-xl font-bold space-x-0">
            <span className="text-gray-900">invonotify</span>
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-4 mt-6">
        <DashboardLinks />
      </nav>
    </div>
  );
}
