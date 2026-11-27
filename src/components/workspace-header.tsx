import type { ReactNode } from "react"
import { Logo } from "@/components/logo"

type Props = {
  current: "studio" | "history"
  openInNewTab?: boolean
  onHome?: () => void
  children?: ReactNode
}

export function WorkspaceHeader({ current, openInNewTab, onHome, children }: Props) {
  const linkProps = openInNewTab ? { target: "_blank", rel: "noopener", title: "Откроется в новой вкладке" } : undefined
  return <header className="workspace-header">
    <div className="header-inner">
      <Logo onClick={onHome} />
      <nav className="studio-nav" aria-label="Разделы «Вслух»">
        <a {...linkProps} href="#studio" aria-current={current === "studio" ? "page" : undefined}>Студия</a>
        <a {...linkProps} href="#history" aria-current={current === "history" ? "page" : undefined}>Мои защиты</a>
      </nav>
      {children && <div className="header-end">{children}</div>}
    </div>
  </header>
}
