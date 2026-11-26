import type { ReactNode } from "react"
import { Logo } from "@/components/logo"

type Props = {
  current?: "studio" | "history"
  context?: string
  onHome?: () => void
  children?: ReactNode
}

export function WorkspaceHeader({ current, context, onHome, children }: Props) {
  return <header className="workspace-header">
    <div className="header-inner">
      <Logo onClick={onHome} />
      {current ? <nav className="studio-nav" aria-label="Разделы Proof">
        <a href="#studio" aria-current={current === "studio" ? "page" : undefined}>Студия</a>
        <a href="#history" aria-current={current === "history" ? "page" : undefined}>Мои защиты</a>
      </nav> : <span className="header-context">{context}</span>}
      {children && <div className="header-end">{children}</div>}
    </div>
  </header>
}
