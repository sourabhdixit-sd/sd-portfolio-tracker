import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "MF Tracker",
  description: "Indian Mutual Fund Tracker Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-slate-900 text-slate-100 antialiased">
        <div className="flex h-full min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-auto bg-slate-900">
            <div className="p-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
