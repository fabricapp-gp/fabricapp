import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { Sidebar } from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FABRICINTEL | AI Fabric Planning",
  description: "Predict Demand. Plan Fabric. Prevent Shortages.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <AuthProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 md:pl-72 flex flex-col min-w-0 pt-16 md:pt-0">
              <div className="flex-1 overflow-x-hidden overflow-y-auto">
                <div className="mx-auto w-full max-w-full p-4 md:p-8">
                  {children}
                </div>
              </div>
            </main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
