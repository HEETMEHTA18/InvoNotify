import Link from "next/link";
import { MobileMenu } from "@/components/MobileMenu";
import { auth } from "@/lib/auth";
import {
  FileText,
  ArrowRight,
  Shield,
  Zap,
  BarChart3,
  Send,
  CheckCircle,
  ChevronRight,
  CreditCard,
  Globe,
  Lock,
  Users,
} from "lucide-react";

export default async function Home() {
  const session = await auth();

  return (
    <div className="min-h-screen bg-[#FBFCFC]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* ─── NAVBAR ─── */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-[#FBFCFC]/80 border-b border-[#EDEFF2]">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="h-9 w-9 rounded-lg bg-[#596778] flex items-center justify-center group-hover:scale-105 transition-transform">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-[#596778] tracking-tight">InvoiceFlow</span>
            </Link>

            {/* Nav Links */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-[#8691A6] hover:text-[#596778] transition-colors">
                Features
              </a>
              <a href="#how-it-works" className="text-sm font-medium text-[#8691A6] hover:text-[#596778] transition-colors">
                How it Works
              </a>
              <a href="#pricing" className="text-sm font-medium text-[#8691A6] hover:text-[#596778] transition-colors">
                Pricing
              </a>
              <a href="#testimonials" className="text-sm font-medium text-[#8691A6] hover:text-[#596778] transition-colors">
                Testimonials
              </a>
            </div>

            {/* Auth Buttons */}
            <div className="flex items-center gap-3">
              {session?.user ? (
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#596778] text-white text-sm font-semibold rounded-lg hover:bg-[#4a5666] transition-all shadow-sm hover:shadow-md"
                >
                  Dashboard
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="hidden sm:inline-flex px-4 py-2 text-sm font-medium text-[#596778] hover:text-[#4a5666] transition-colors"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#596778] text-white text-sm font-semibold rounded-lg hover:bg-[#4a5666] transition-all shadow-sm hover:shadow-md"
                  >
                    Get Started
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </>
              )}
              <MobileMenu />
            </div>
          </div>
        </div>
      </nav>

      {/* ─── HERO SECTION ─── */}
      <section className="relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-[#EDEFF2] opacity-60 blur-3xl" />
          <div className="absolute top-60 -left-40 w-[400px] h-[400px] rounded-full bg-[#D9DCE0] opacity-40 blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 pt-16 pb-20 lg:pt-24 lg:pb-28">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left - Copy */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#EDEFF2] rounded-full mb-6">
                <div className="w-2 h-2 rounded-full bg-[#596778] animate-pulse" />
                <span className="text-xs font-semibold text-[#596778] uppercase tracking-wide">
                  Invoice Management Made Simple
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold text-[#596778] leading-[1.1] tracking-tight mb-6">
                Get paid faster,{" "}
                <span className="relative">
                  manage invoices
                  <svg className="absolute -bottom-1 left-0 w-full" viewBox="0 0 300 12" fill="none">
                    <path d="M2 8C50 2 150 2 298 8" stroke="#8691A6" strokeWidth="3" strokeLinecap="round" opacity="0.3" />
                  </svg>
                </span>{" "}
                effortlessly.
              </h1>

              <p className="text-lg text-[#8691A6] leading-relaxed mb-8 max-w-lg">
                Create professional invoices, track payments, and send them directly to your clients — all in one streamlined platform built for modern businesses.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-10">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-[#596778] text-white text-sm font-semibold rounded-xl hover:bg-[#4a5666] transition-all shadow-lg shadow-[#596778]/20 hover:shadow-xl hover:shadow-[#596778]/30 hover:-translate-y-0.5"
                >
                  Start for Free
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-[#596778] text-sm font-semibold rounded-xl border border-[#D9DCE0] hover:border-[#B2B7C0] hover:bg-[#FBFCFC] transition-all"
                >
                  See How It Works
                </a>
              </div>

              {/* Trust badges */}
              <div className="flex items-center gap-6 pt-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-[#8691A6]" />
                  <span className="text-xs text-[#B2B7C0] font-medium">Free to start</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-[#8691A6]" />
                  <span className="text-xs text-[#B2B7C0] font-medium">No credit card</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-[#8691A6]" />
                  <span className="text-xs text-[#B2B7C0] font-medium">Cancel anytime</span>
                </div>
              </div>
            </div>

            {/* Right - Dashboard Preview Card */}
            <div className="relative">
              <div className="relative z-10">
                {/* Main dashboard card */}
                <div className="bg-white rounded-2xl border border-[#EDEFF2] shadow-2xl shadow-[#596778]/8 p-6 transform lg:rotate-1 hover:rotate-0 transition-transform duration-500">
                  {/* Mini header */}
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#D9DCE0]" />
                      <div className="w-3 h-3 rounded-full bg-[#D9DCE0]" />
                      <div className="w-3 h-3 rounded-full bg-[#D9DCE0]" />
                    </div>
                    <div className="h-6 w-24 bg-[#EDEFF2] rounded-md" />
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    <div className="bg-[#FBFCFC] border border-[#EDEFF2] rounded-xl p-3">
                      <p className="text-xs text-[#B2B7C0] mb-1">Revenue</p>
                      <p className="text-lg font-bold text-[#596778]">$12,480</p>
                      <span className="text-xs text-green-500 font-medium">+12.5%</span>
                    </div>
                    <div className="bg-[#FBFCFC] border border-[#EDEFF2] rounded-xl p-3">
                      <p className="text-xs text-[#B2B7C0] mb-1">Invoices</p>
                      <p className="text-lg font-bold text-[#596778]">48</p>
                      <span className="text-xs text-green-500 font-medium">+8 new</span>
                    </div>
                    <div className="bg-[#FBFCFC] border border-[#EDEFF2] rounded-xl p-3">
                      <p className="text-xs text-[#B2B7C0] mb-1">Paid</p>
                      <p className="text-lg font-bold text-[#596778]">92%</p>
                      <span className="text-xs text-green-500 font-medium">+3.2%</span>
                    </div>
                  </div>

                  {/* Mini chart */}
                  <div className="bg-[#FBFCFC] border border-[#EDEFF2] rounded-xl p-4 mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-[#596778]">Monthly Revenue</span>
                      <span className="text-xs text-[#B2B7C0]">Last 6 months</span>
                    </div>
                    <svg viewBox="0 0 400 80" className="w-full h-16">
                      <defs>
                        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8691A6" stopOpacity="0.2" />
                          <stop offset="100%" stopColor="#8691A6" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d="M0 65 L67 50 L134 55 L200 35 L267 25 L334 30 L400 10" fill="none" stroke="#596778" strokeWidth="2.5" strokeLinecap="round" />
                      <path d="M0 65 L67 50 L134 55 L200 35 L267 25 L334 30 L400 10 L400 80 L0 80Z" fill="url(#chartGrad)" />
                      <circle cx="400" cy="10" r="4" fill="#596778" />
                    </svg>
                  </div>

                  {/* Mini invoice rows */}
                  <div className="space-y-2">
                    {[
                      { name: "Acme Corp", amount: "$2,400", status: "Paid" },
                      { name: "Globex Inc", amount: "$1,850", status: "Pending" },
                      { name: "Stark Industries", amount: "$3,200", status: "Paid" },
                    ].map((inv, i) => (
                      <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[#FBFCFC]">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[#EDEFF2] flex items-center justify-center">
                            <FileText className="h-4 w-4 text-[#8691A6]" />
                          </div>
                          <span className="text-sm font-medium text-[#596778]">{inv.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-[#596778]">{inv.amount}</span>
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${inv.status === "Paid"
                              ? "bg-green-50 text-green-600"
                              : "bg-yellow-50 text-yellow-600"
                              }`}
                          >
                            {inv.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Floating card - payment notification */}
                <div className="absolute -left-8 top-20 z-20 bg-white rounded-xl border border-[#EDEFF2] shadow-xl p-4 transform -rotate-3 hover:rotate-0 transition-transform duration-500 hidden lg:block">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#596778]">Payment Received</p>
                      <p className="text-sm font-bold text-green-600">+$1,075.00</p>
                    </div>
                  </div>
                </div>

                {/* Floating card - send invoice */}
                <div className="absolute -right-4 bottom-16 z-20 bg-white rounded-xl border border-[#EDEFF2] shadow-xl p-4 transform rotate-2 hover:rotate-0 transition-transform duration-500 hidden lg:block">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#EDEFF2] flex items-center justify-center">
                      <Send className="h-5 w-5 text-[#596778]" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#596778]">Invoice Sent</p>
                      <p className="text-xs text-[#B2B7C0]">INV-2024-048</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── TRUSTED BY ─── */}
      <section className="border-y border-[#EDEFF2] bg-[#FBFCFC]">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-10">
          <p className="text-center text-xs font-semibold text-[#B2B7C0] uppercase tracking-widest mb-8">
            Trusted by innovative companies
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
            {["TechFlow", "CloudBase", "DataSync", "NetVault", "CodeLab"].map((name) => (
              <div key={name} className="flex items-center gap-2 opacity-40 hover:opacity-70 transition-opacity">
                <div className="w-6 h-6 rounded bg-[#B2B7C0]" />
                <span className="text-base font-bold text-[#8691A6] tracking-tight">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section id="features" className="py-20 lg:py-28 bg-[#FBFCFC]">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#EDEFF2] rounded-full mb-4">
              <Zap className="h-3.5 w-3.5 text-[#596778]" />
              <span className="text-xs font-semibold text-[#596778] uppercase tracking-wide">Features</span>
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#596778] tracking-tight mb-4">
              Experience that grows with your scale.
            </h2>
            <p className="text-base text-[#8691A6] leading-relaxed">
              Everything you need to manage invoices professionally — from creation to payment tracking, all in one place.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: CreditCard,
                title: "Free Invoicing",
                desc: "Create unlimited professional invoices at no cost. Add line items, taxes, and discounts with ease.",
                accent: "bg-blue-50",
                iconColor: "text-blue-600",
              },
              {
                icon: Globe,
                title: "Multi-Currency",
                desc: "Support for USD, EUR, GBP, INR, and more. Invoice international clients without friction.",
                accent: "bg-purple-50",
                iconColor: "text-purple-600",
              },
              {
                icon: Lock,
                title: "Secure & Reliable",
                desc: "Enterprise-grade security with encrypted data and secure authentication. Your data is always safe.",
                accent: "bg-green-50",
                iconColor: "text-green-600",
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="group bg-white border border-[#EDEFF2] rounded-2xl p-7 hover:border-[#D9DCE0] hover:shadow-lg hover:shadow-[#596778]/5 transition-all duration-300 hover:-translate-y-1"
              >
                <div className={`w-12 h-12 rounded-xl ${feature.accent} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                  <feature.icon className={`h-6 w-6 ${feature.iconColor}`} />
                </div>
                <h3 className="text-lg font-bold text-[#596778] mb-2">{feature.title}</h3>
                <p className="text-sm text-[#8691A6] leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section id="how-it-works" className="py-20 lg:py-28 bg-[#EDEFF2]/40">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-white rounded-full mb-4 border border-[#EDEFF2]">
                <BarChart3 className="h-3.5 w-3.5 text-[#596778]" />
                <span className="text-xs font-semibold text-[#596778] uppercase tracking-wide">How it Works</span>
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#596778] tracking-tight mb-6">
                Simple workflow, powerful results.
              </h2>
              <p className="text-base text-[#8691A6] leading-relaxed mb-10 max-w-md">
                From creating your first invoice to getting paid — we&apos;ve streamlined every step so you can focus on your business.
              </p>

              <div className="space-y-6">
                {[
                  {
                    step: "01",
                    title: "Create Invoice",
                    desc: "Fill in client details, add line items with quantities and rates. Totals calculate automatically.",
                  },
                  {
                    step: "02",
                    title: "Preview & Customize",
                    desc: "Preview the professional PDF with your company logo and signature before sending.",
                  },
                  {
                    step: "03",
                    title: "Send & Track",
                    desc: "Email the invoice directly to your client and track payment status in real-time.",
                  },
                ].map((item, i) => (
                  <div key={i} className="flex gap-5 group">
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[#596778] text-white flex items-center justify-center font-bold text-sm group-hover:scale-110 transition-transform">
                      {item.step}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[#596778] mb-1">{item.title}</h3>
                      <p className="text-sm text-[#8691A6] leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right side - visual */}
            <div className="relative">
              <div className="bg-white rounded-2xl border border-[#EDEFF2] shadow-xl p-6">
                {/* Invoice preview mock */}
                <div className="bg-[#596778] rounded-xl p-5 mb-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="w-8 h-8 rounded bg-white/20 mb-2" />
                      <div className="w-20 h-2 bg-white/30 rounded" />
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-white">INVOICE</p>
                      <p className="text-xs text-white/60">INV-2024-048</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-[10px] text-white/40 uppercase mb-1">From</p>
                      <div className="w-24 h-2 bg-white/30 rounded mb-1" />
                      <div className="w-20 h-2 bg-white/20 rounded" />
                    </div>
                    <div>
                      <p className="text-[10px] text-white/40 uppercase mb-1">Bill To</p>
                      <div className="w-24 h-2 bg-white/30 rounded mb-1" />
                      <div className="w-20 h-2 bg-white/20 rounded" />
                    </div>
                  </div>
                </div>

                {/* Table mock */}
                <div className="space-y-0 mb-5">
                  <div className="grid grid-cols-4 gap-2 py-2 border-b border-[#EDEFF2]">
                    <span className="text-xs font-semibold text-[#596778] col-span-2">Description</span>
                    <span className="text-xs font-semibold text-[#596778] text-center">Qty</span>
                    <span className="text-xs font-semibold text-[#596778] text-right">Amount</span>
                  </div>
                  {[
                    { name: "UI/UX Design", qty: "40h", amount: "$4,000" },
                    { name: "Development", qty: "80h", amount: "$8,000" },
                    { name: "Deployment", qty: "8h", amount: "$480" },
                  ].map((row, i) => (
                    <div key={i} className="grid grid-cols-4 gap-2 py-2.5 border-b border-[#EDEFF2]/60">
                      <span className="text-sm text-[#596778] col-span-2">{row.name}</span>
                      <span className="text-sm text-[#8691A6] text-center">{row.qty}</span>
                      <span className="text-sm font-medium text-[#596778] text-right">{row.amount}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <div className="w-48">
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-xs text-[#B2B7C0]">Subtotal</span>
                      <span className="text-sm font-medium text-[#596778]">$12,480</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-t border-[#EDEFF2]">
                      <span className="text-sm font-bold text-[#596778]">Total</span>
                      <span className="text-base font-bold text-[#596778]">$12,480</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── STATS ─── */}
      <section className="py-20 lg:py-24 bg-[#596778]">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-3">
              We&apos;ve helped innovative companies
            </h2>
            <p className="text-base text-[#B2B7C0]">
              Numbers that speak for themselves.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { value: "99%", label: "Uptime SLA" },
              { value: "180K+", label: "Invoices Sent" },
              { value: "10+", label: "Currencies" },
              { value: "4.9★", label: "User Rating" },
            ].map((stat, i) => (
              <div key={i} className="text-center p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                <p className="text-3xl sm:text-4xl font-extrabold text-white mb-1">{stat.value}</p>
                <p className="text-sm text-[#B2B7C0]">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIALS ─── */}
      <section id="testimonials" className="py-20 lg:py-28 bg-[#FBFCFC]">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#EDEFF2] rounded-full mb-4">
              <Users className="h-3.5 w-3.5 text-[#596778]" />
              <span className="text-xs font-semibold text-[#596778] uppercase tracking-wide">Testimonials</span>
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#596778] tracking-tight mb-4">
              Why they prefer InvoiceFlow
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                quote: "InvoiceFlow cut our invoicing time by 70%. The PDF generation and email sending is seamless.",
                name: "Sarah Chen",
                role: "Founder, TechFlow",
              },
              {
                quote: "The cleanest invoice platform I've used. My clients are impressed by the professional invoices.",
                name: "Marcus Johnson",
                role: "Freelance Designer",
              },
              {
                quote: "Multi-currency support was a game changer for our international clients. Simple and effective.",
                name: "Priya Sharma",
                role: "CEO, DataSync",
              },
            ].map((testimonial, i) => (
              <div key={i} className="bg-white border border-[#EDEFF2] rounded-2xl p-7 hover:shadow-lg hover:shadow-[#596778]/5 transition-all duration-300">
                <div className="flex gap-1 mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span key={star} className="text-yellow-400 text-sm">★</span>
                  ))}
                </div>
                <p className="text-sm text-[#8691A6] leading-relaxed mb-6">&ldquo;{testimonial.quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#EDEFF2] flex items-center justify-center">
                    <span className="text-sm font-bold text-[#596778]">{testimonial.name[0]}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#596778]">{testimonial.name}</p>
                    <p className="text-xs text-[#B2B7C0]">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-20 lg:py-24 bg-[#EDEFF2]/50">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <div className="bg-white rounded-3xl border border-[#EDEFF2] shadow-xl shadow-[#596778]/5 p-10 lg:p-14">
            <div className="w-14 h-14 rounded-2xl bg-[#596778] flex items-center justify-center mx-auto mb-6">
              <Zap className="h-7 w-7 text-white" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#596778] tracking-tight mb-4">
              Ready to streamline your invoicing?
            </h2>
            <p className="text-base text-[#8691A6] leading-relaxed mb-8 max-w-lg mx-auto">
              Join thousands of businesses that trust InvoiceFlow for their invoicing needs. Get started in under 2 minutes.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-[#596778] text-white text-sm font-semibold rounded-xl hover:bg-[#4a5666] transition-all shadow-lg shadow-[#596778]/20 hover:shadow-xl hover:-translate-y-0.5"
              >
                Get Started — It&apos;s Free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="bg-[#596778] border-t border-[#4a5666]">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12">
          <div className="grid md:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div className="md:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <span className="text-lg font-bold text-white tracking-tight">InvoiceFlow</span>
              </div>
              <p className="text-sm text-[#B2B7C0] leading-relaxed">
                Professional invoice management for modern businesses.
              </p>
            </div>

            {/* Links */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2.5">
                {["Features", "Pricing", "Integrations", "Changelog"].map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm text-[#B2B7C0] hover:text-white transition-colors">{link}</a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2.5">
                {["About", "Blog", "Careers", "Contact"].map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm text-[#B2B7C0] hover:text-white transition-colors">{link}</a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2.5">
                {["Privacy", "Terms", "Security", "GDPR"].map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm text-[#B2B7C0] hover:text-white transition-colors">{link}</a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-[#B2B7C0]">
              © 2024 InvoiceFlow. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              {["Twitter", "LinkedIn", "GitHub"].map((social) => (
                <a key={social} href="#" className="text-xs text-[#B2B7C0] hover:text-white transition-colors">
                  {social}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
