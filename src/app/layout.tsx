import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { ColorThemeProvider } from "@/components/color-theme-provider";
import { COLOR_THEME_STORAGE_KEY, DEFAULT_COLOR_THEME, COLOR_THEMES } from "@/lib/color-themes";
import "./globals.css";

// Runs before hydration so the correct color theme applies on first paint —
// mirrors next-themes' own approach to avoiding a flash of the wrong theme.
const setColorThemeScript = `(function(){try{var v=${JSON.stringify(COLOR_THEMES.map((t) => t.id))};var s=localStorage.getItem(${JSON.stringify(COLOR_THEME_STORAGE_KEY)});document.documentElement.setAttribute('data-color-theme',v.indexOf(s)!==-1?s:${JSON.stringify(DEFAULT_COLOR_THEME)});}catch(e){}})();`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gatekeeper",
  description: "Enterprise Access Governance Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: setColorThemeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="light">
          <ColorThemeProvider>{children}</ColorThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
