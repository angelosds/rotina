import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "@rotina/ui/styles.css";
export const metadata: Metadata = {
  title: { default: "Rotina", template: "%s · Rotina" },
  description: "Sua rotina, em um só lugar.",
  applicationName: "Rotina",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Rotina",
    statusBarStyle: "black-translucent",
  },
  other: { "apple-mobile-web-app-capable": "yes" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f7" },
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
  ],
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <a className="skip" href="#conteudo">
          Pular para o conteúdo
        </a>
        <div className="shell">
          <header className="topbar">
            <Link href="/" className="brand">
              rotina
            </Link>
          </header>
          <main id="conteudo">{children}</main>
        </div>
      </body>
    </html>
  );
}
