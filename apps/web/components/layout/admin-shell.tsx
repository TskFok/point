"use client";

import {
  Boxes,
  ClipboardList,
  Gauge,
  Menu,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const adminItems = [
  { href: "/admin", icon: Gauge, label: "管理概览" },
  { href: "/admin/questions", icon: ClipboardList, label: "题库管理" },
  { href: "/admin/products", icon: Boxes, label: "商品管理" },
  { href: "/admin/orders", icon: ShieldCheck, label: "订单管理" },
  { href: "/admin/points", icon: Settings2, label: "积分设置" },
];

function isActivePath(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== "/admin" && pathname.startsWith(`${href}/`))
  );
}

function AdminNavigation({
  ariaLabel,
  currentPath,
  onNavigate,
}: {
  ariaLabel: string;
  currentPath: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label={ariaLabel} className="sidebar-nav">
      {adminItems.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            aria-current={
              isActivePath(currentPath, item.href) ? "page" : undefined
            }
            className="sidebar-nav__link"
            href={item.href}
            key={item.href}
            onClick={onNavigate}
          >
            <Icon aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
type AdminShellProps = {
  children: ReactNode;
  user: {
    pointsBalance: number;
    username: string;
  };
};

export function AdminShell({ children, user }: AdminShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);

  const closeMenu = useCallback(() => {
    restoreFocusRef.current = true;
    setMenuOpen(false);
  }, []);

  useEffect(() => {
    if (!menuOpen && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      openerRef.current?.focus();
    }
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [closeMenu, menuOpen]);

  return (
    <div className="app-shell app-shell--admin">
      <aside
        aria-hidden={menuOpen || undefined}
        className="app-sidebar"
      >
        <Link className="brand" href="/admin">
          <span aria-hidden="true" className="brand__mark brand__mark--admin">
            A
          </span>
          <span>
            <strong>Point Quest</strong>
            <small>运营管理台</small>
          </span>
        </Link>
        <AdminNavigation
          ariaLabel="管理员主导航"
          currentPath={pathname}
        />
      </aside>

      <div
        aria-hidden={menuOpen || undefined}
        className="app-workspace"
      >
        <header className="app-header">
          <button
            aria-expanded={menuOpen}
            aria-controls="admin-mobile-menu"
            aria-haspopup="dialog"
            aria-label="打开管理员菜单"
            className="admin-menu-button"
            onClick={() => setMenuOpen(true)}
            ref={openerRef}
            type="button"
          >
            <Menu aria-hidden="true" />
          </button>
          <div>
            <p className="app-header__eyebrow">运营工作台</p>
            <strong>{user.username}</strong>
          </div>
          <div className="admin-role-chip">
            <ShieldCheck aria-hidden="true" />
            <span>管理员</span>
          </div>
        </header>
        <main className="app-content">{children}</main>
      </div>

      {menuOpen ? (
        <div className="admin-drawer-layer">
          <button
            aria-hidden="true"
            className="admin-drawer-backdrop"
            onClick={closeMenu}
            tabIndex={-1}
            type="button"
          />
          <aside
            aria-labelledby="admin-mobile-menu-title"
            aria-modal="true"
            className="admin-drawer"
            id="admin-mobile-menu"
            ref={dialogRef}
            role="dialog"
          >
            <div className="admin-drawer__header">
              <strong id="admin-mobile-menu-title">管理菜单</strong>
              <button
                aria-label="关闭管理员菜单"
                onClick={closeMenu}
                ref={closeButtonRef}
                type="button"
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <AdminNavigation
              ariaLabel="管理员移动导航"
              currentPath={pathname}
              onNavigate={closeMenu}
            />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
