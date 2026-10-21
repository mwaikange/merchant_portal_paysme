import type { ReactNode } from "react";

type PortalShellProps = {
  header: ReactNode;
  sidebar: ReactNode;
  sidebarFooter: ReactNode;
  children: ReactNode;
  overlays?: ReactNode;
  pageKey?: string;
};

/** Keep navigation and page scrolling independent within the visible window. */
export function PortalShell({ header, sidebar, sidebarFooter, children, overlays, pageKey }: PortalShellProps) {
  return (
    <div className="portal-frame">
      <a className="portal-skip-link" href="#portal-main">Skip to page content</a>
      <header className="portal-header">{header}</header>
      <div className="portal-workspace">
        <aside className="portal-sidebar" aria-label="Merchant menu">
          <nav className="portal-sidebar-scroll" aria-label="Merchant navigation">{sidebar}</nav>
          <div className="portal-sidebar-footer">{sidebarFooter}</div>
        </aside>
        <main key={pageKey} id="portal-main" className="portal-frame-content" tabIndex={0} aria-label="Portal page">
          <div className="portal-page">{children}</div>
        </main>
      </div>
      {overlays}
    </div>
  );
}
