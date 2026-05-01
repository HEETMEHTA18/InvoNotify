"use client";

import React from "react";
import { Mail, Linkedin, Twitter, Github, Facebook } from "lucide-react";
import { getPublicDocsHref } from "@/lib/docs-config";

interface FooterLink {
  label: string;
  href: string;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

export default function Footer() {
  const currentYear = new Date().getFullYear();

  const footerColumns: FooterColumn[] = [
    {
      title: "Product",
      links: [
        { label: "Features", href: "#features" },
        { label: "Pricing", href: "/register" },
        { label: "Security", href: "/register" },
        { label: "Roadmap", href: "/register" },
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "Documentation", href: getPublicDocsHref() },
        { label: "Architecture", href: getPublicDocsHref("architecture") },
        { label: "Blog", href: getPublicDocsHref() },
        { label: "SRS", href: getPublicDocsHref("srs") },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About", href: "#how-it-works" },
        { label: "Careers", href: "/register" },
        { label: "Press", href: "/register" },
        { label: "Contact", href: "mailto:hello@invonotify.com" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy Policy", href: "/register" },
        { label: "Terms of Service", href: "/register" },
        { label: "Cookie Policy", href: "/register" },
        { label: "GDPR", href: "/register" },
      ],
    },
  ];

  const socialLinks = [
    { icon: Twitter, href: "https://twitter.com", label: "Twitter" },
    { icon: Linkedin, href: "https://linkedin.com", label: "LinkedIn" },
    { icon: Github, href: "https://github.com", label: "GitHub" },
    { icon: Facebook, href: "https://facebook.com", label: "Facebook" },
  ];

  return (
    <footer className="bg-[#1F2937] text-white pt-12 md:pt-16 lg:pt-20 pb-8 md:pb-12">
      {/* Newsletter Section */}
      <div className="px-4 md:px-6 lg:px-8 mb-12 md:mb-16 lg:mb-20">
        <div className="max-w-7xl mx-auto bg-linear-to-r from-[#596778]/20 to-[#8B5CF6]/20 rounded-2xl border border-[#8691A6]/30 p-8 md:p-12">
          <div className="max-w-2xl">
            <h3 className="text-2xl md:text-3xl font-bold mb-3 md:mb-4">
              Stay Updated
            </h3>
            <p className="text-white/70 mb-6 md:mb-8">
              Get the latest updates, features, and invoicing tips delivered to
              your inbox.
            </p>

            <form className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                placeholder="your@email.com"
                className="flex-1 px-4 md:px-6 py-3 md:py-4 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 transition-all"
              />
              <button
                type="submit"
                className="px-6 md:px-8 py-3 md:py-4 bg-[#596778] hover:bg-[#4a5568] text-white font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                Subscribe
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Main Footer Content */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 md:gap-8 lg:gap-12 mb-12 md:mb-16 lg:mb-20">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="mb-4 md:mb-6">
                <h2 className="text-2xl md:text-3xl font-bold bg-linear-to-r from-[#596778] to-[#8B5CF6] bg-clip-text text-transparent">
                  Invonotify
                </h2>
              </div>
              <p className="text-white/60 text-sm md:text-base mb-4 md:mb-6 leading-relaxed">
                Modern invoicing for businesses of all sizes. Get paid faster
                with Invonotify.
              </p>

              {/* Social Links */}
              <div className="flex gap-3 md:gap-4">
                {socialLinks.map((social) => {
                  const IconComponent = social.icon;
                  return (
                    <a
                      key={social.label}
                      href={social.href}
                      className="w-10 h-10 rounded-lg bg-white/10 hover:bg-[#596778] flex items-center justify-center transition-colors"
                      aria-label={social.label}
                    >
                      <IconComponent className="w-5 h-5" />
                    </a>
                  );
                })}
              </div>
            </div>

            {/* Footer Columns */}
            {footerColumns.map((column, index) => (
              <div key={index}>
                <h4 className="font-semibold text-white mb-4 md:mb-6 text-sm md:text-base">
                  {column.title}
                </h4>
                <ul className="space-y-2 md:space-y-3">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-white/60 hover:text-white transition-colors text-sm md:text-base"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-white/10 mb-8 md:mb-12" />

          {/* Bottom Section */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 md:gap-8 text-sm md:text-base text-white/60">
            <p>© {currentYear} invonotify. All rights reserved.</p>

            <div className="flex gap-6 md:gap-8">
              <a
                href="/register"
                className="hover:text-white transition-colors"
              >
                Status
              </a>
              <a
                href="mailto:hello@invonotify.com"
                className="flex items-center gap-2 hover:text-white transition-colors"
              >
                <Mail className="w-4 h-4" />
                hello@invonotify.com
              </a>
            </div>
          </div>

          {/* Accessibility Notice */}
          <div className="mt-8 md:mt-12 pt-8 md:pt-12 border-t border-white/10">
            <p className="text-xs md:text-sm text-white/40 text-center">
              invonotify is committed to accessibility. If you encounter any
              accessibility issues, please{" "}
              <a
                href="mailto:hello@invonotify.com"
                className="underline hover:text-white/60"
              >
                contact us
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
