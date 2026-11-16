import type { Metadata } from "next";
import { Geist, Geist_Mono, Bodoni_Moda, Archivo } from "next/font/google";
import "./globals.css";
import { ShellSwitch } from "@/components/shell-switch";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const bodoni = Bodoni_Moda({ variable: "--font-display", subsets: ["latin"], style: ["normal", "italic"], weight: ["400", "500", "600", "700"], display: "swap" });
const archivo = Archivo({ variable: "--font-grotesk", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });

export const metadata: Metadata = {
  title: "VantagePoint Trading: AI Visual Trading Protocols",
  description: "Build, execute and backtest AI-powered trading protocols visually.",
  icons: { icon: "/logo-mark.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${bodoni.variable} ${archivo.variable} h-full dark`}>
      <body className="min-h-full">
        <ShellSwitch>{children}</ShellSwitch>
      </body>
    </html>
  );
}
