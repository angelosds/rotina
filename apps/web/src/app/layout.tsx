import type { Metadata } from "next";
import Link from "next/link";
import "@rotina/ui/styles.css";
export const metadata: Metadata = {
  title: { default: "Rotina", template: "%s · Rotina" },
  description: "Sua rotina, em um só lugar.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  const env = process.env.APP_ENV ?? "local";
  return (
    <html lang="pt-BR">
      <body>
        <a className="skip" href="#conteudo">
          Pular para o conteúdo
        </a>
        {env !== "production" && (
          <div className="banner">
            {env === "local"
              ? "Desenvolvimento local"
              : env === "preview"
                ? "Prévia de teste"
                : "Ambiente de testes"}{" "}
            · Dados separados da produção
          </div>
        )}
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
