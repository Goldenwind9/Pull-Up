import type { Metadata, Viewport } from "next";
import { Fredoka } from "next/font/google";
import "./globals.css";

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PullUp",
  description: "Weekly AI side quests for your crew",
};

export const viewport: Viewport = {
  themeColor: "#FFA62B",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${fredoka.variable} overflow-x-hidden antialiased`}>{children}</body>
    </html>
  );
}
