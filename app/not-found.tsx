"use client";

import Link from "next/link";
import { Globe, Home, MousePointer2 } from "lucide-react";
import {
  MouseTrackerProvider,
  Pointer,
  PointerFollower,
} from "@/components/ui/mouse-tracker";

export default function NotFound() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,197,94,0.16),transparent_35%),radial-gradient(circle_at_85%_78%,rgba(34,197,94,0.1),transparent_30%)]" />

      <MouseTrackerProvider className="relative z-10 min-h-screen">
        <Pointer>
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-lime-400/70 bg-black/70 shadow-[0_0_24px_rgba(132,255,111,0.5)]">
            <MousePointer2 className="h-4 w-4 text-lime-300" />
          </div>
        </Pointer>

        <PointerFollower align="bottom-right" className="rounded-md border border-lime-300/50 bg-lime-200 px-3 py-1.5 text-xs font-semibold text-black shadow-[0_8px_30px_rgba(130,255,120,0.28)]">
          Visit Resource
        </PointerFollower>

        <section className="relative flex min-h-screen items-center justify-center px-6 py-12">
          <div className="absolute left-6 top-6 flex items-center gap-2 text-lime-400/95">
            <Globe className="h-10 w-10" strokeWidth={1.5} />
          </div>

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[72vmin] w-[72vmin] max-h-180 max-w-180 rounded-full border border-gray-700/60">
              <div className="h-full w-full rounded-full border border-gray-700/50 transform-[rotate(25deg)]" />
              <div className="absolute inset-[12%] rounded-full border border-gray-700/40" />
              <div className="absolute inset-[23%] rounded-full border border-gray-700/30" />
            </div>
          </div>

          <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center text-center">
            <p className="mb-6 text-[clamp(3rem,10vw,9rem)] font-black uppercase tracking-[0.14em] text-white/95 [text-shadow:0_0_14px_rgba(255,255,255,0.22)]">
              404
            </p>
            <h1 className="text-balance text-[clamp(2.1rem,6vw,5.6rem)] font-extrabold uppercase leading-[0.92] tracking-[0.08em] text-white/95">
              NOT FOUND
            </h1>
            <p className="mt-5 max-w-xl text-sm text-gray-300 md:text-base">
              The URL is invalid or this page no longer exists. Jump back home to
              continue managing invoices.
            </p>

            <div className="mt-10">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-xl border border-lime-300/60 bg-lime-200 px-5 py-3 text-sm font-semibold text-black transition-transform duration-200 hover:scale-[1.03]"
              >
                <Home className="h-4 w-4" />
                Back To Home
              </Link>
            </div>
          </div>
        </section>
      </MouseTrackerProvider>
    </main>
  );
}
