import type { Metadata } from "next";
import "./globals.css";
import { Poppins, Source_Serif_4 } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-poppins",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  style: ["italic"],
  weight: ["400"],
  variable: "--font-source-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EXPOSÉ — Labour Exploitation Intelligence",
  description: "AI-powered supply chain labour rights research tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${poppins.variable} ${sourceSerif.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
