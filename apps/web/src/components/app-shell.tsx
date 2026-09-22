"use client";

import {
  CalendarDays,
  CheckSquare,
  Settings,
  Sun,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function PrimaryNavigation({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Navegação principal">
      <Link
        href="/hoje"
        className={isCurrent(pathname, "/hoje") ? "current" : undefined}
        aria-current={isCurrent(pathname, "/hoje") ? "page" : undefined}
      >
        <Sun aria-hidden size={20} /> Hoje
      </Link>
      <span aria-disabled="true">
        <CheckSquare aria-hidden size={20} /> Tarefas
      </span>
      <span aria-disabled="true">
        <CalendarDays aria-hidden size={20} /> Agenda
      </span>
      <Link
        href="/financas/gastos"
        className={
          isCurrent(pathname, "/financas") ? "current" : undefined
        }
        aria-current={
          isCurrent(pathname, "/financas") ? "page" : undefined
        }
      >
        <WalletCards aria-hidden size={20} /> Finanças
      </Link>
    </nav>
  );
}

export function AppShell({
  children,
  isOwner,
}: {
  children: ReactNode;
  isOwner: boolean;
}) {
  const pathname = usePathname();
  const settingsCurrent = isCurrent(pathname, "/configuracoes");
  const [bottomNavigationReady, setBottomNavigationReady] = useState(false);

  useEffect(() => {
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setBottomNavigationReady(true);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, []);

  return (
    <div className="app-shell">
      <header className="app-mobile-header">
        <Link href="/hoje" className="app-mobile-brand">
          rotina
        </Link>
        {isOwner && (
          <Link
            href="/configuracoes/convites"
            className={settingsCurrent ? "icon-button current" : "icon-button"}
            aria-label="Abrir configurações"
            aria-current={settingsCurrent ? "page" : undefined}
          >
            <Settings aria-hidden size={20} />
          </Link>
        )}
      </header>

      <aside className="app-sidebar" aria-label="Navegação principal">
        <Link href="/hoje" className="app-brand">
          rotina
        </Link>
        <PrimaryNavigation pathname={pathname} />
        {isOwner && (
          <Link
            href="/configuracoes/convites"
            className={settingsCurrent ? "app-settings current" : "app-settings"}
            aria-current={settingsCurrent ? "page" : undefined}
          >
            <Settings aria-hidden size={20} /> Configurações
          </Link>
        )}
      </aside>

      <div className="app-main">
        <div className="app-route-content">{children}</div>
      </div>

      {bottomNavigationReady && (
        <div className="app-bottom-nav">
          <PrimaryNavigation pathname={pathname} />
        </div>
      )}
    </div>
  );
}
