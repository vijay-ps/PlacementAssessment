import type { Metadata } from "next";
import { Outfit, Geist_Mono } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AeroStock // Real-Time Multi-Warehouse Inventory Reservation",
  description: "A production-grade, highly concurrent, multi-warehouse inventory reservation and fulfillment engine preventing overselling with row-level database locks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100 font-sans selection:bg-cyan-500/35 selection:text-cyan-200">
        <header className="w-full border-b border-white/[0.06] bg-black/40 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <span className="font-extrabold text-white text-lg tracking-tighter">A</span>
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-white tracking-tight leading-none text-base">AEROSTOCK</span>
                <span className="text-[10px] font-semibold tracking-wider text-cyan-400 mt-1 uppercase">Reservation Engine</span>
              </div>
            </div>
            <nav className="flex items-center gap-6 text-sm font-medium text-zinc-400">
              <a href="/" className="hover:text-white transition-colors">Catalog</a>
              <span className="text-zinc-700">/</span>
              <a href="/?tab=reservations" className="hover:text-white transition-colors">Active Locks</a>
              <span className="text-zinc-700">/</span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold flex items-center gap-1.5 border border-emerald-500/25">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                Node Connected
              </span>
            </nav>
          </div>
        </header>
        <main className="flex-1 flex flex-col">{children}</main>
        <footer className="w-full border-t border-white/[0.06] bg-black/40 py-8 text-center text-xs text-zinc-500">
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <p>© {new Date().getFullYear()} AeroStock Logistics. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <span>PostgreSQL Transactions</span>
              <span className="text-zinc-700">•</span>
              <span>Row-Level SELECT FOR UPDATE</span>
              <span className="text-zinc-700">•</span>
              <span>Idempotency-Safe APIs</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
