import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Invonotify — Professional Invoice Management",
  description: "Create, send, and track professional invoices effortlessly. Free invoicing platform for modern businesses with PDF generation, email delivery, and real-time payment tracking.",
};

import { Toaster } from "sonner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="antialiased"
      >
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
