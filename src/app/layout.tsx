import "./globals.css";
import Header from "@/components/Header";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-sans" });

// Add Chirp font for DM interface
const chirpFontFace = `
  @font-face {
    font-family: 'Chirp';
    src: url('https://abs.twimg.com/responsive-web/client-web/chirp-extended-heavy.woff2') format('woff2');
    font-weight: 800;
    font-display: swap;
  }
  @font-face {
    font-family: 'Chirp';
    src: url('https://abs.twimg.com/responsive-web/client-web/chirp-extended-bold.woff2') format('woff2');
    font-weight: 700;
    font-display: swap;
  }
  @font-face {
    font-family: 'Chirp';
    src: url('https://abs.twimg.com/responsive-web/client-web/chirp-regular.woff2') format('woff2');
    font-weight: 400;
    font-display: swap;
  }
`;

export const metadata: Metadata = {
  title: "Nest - Social Network",
  description: "A modern social networking platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style dangerouslySetInnerHTML={{ __html: chirpFontFace }} />
      </head>
      <body className={`${inter.variable} bg-black text-white font-sans antialiased`}>
        <Header />
        <main className="min-h-screen">
          {children}
        </main>
        <footer className="border-t border-gray-800 py-4 text-center">
          <p className="text-gray-400 text-sm">Made with 💕 by Divyanshu</p>
        </footer>
      </body>
    </html>
  );
}
