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
import { useState, type ReactNode } from "react";

const adminItems = [
  { href: "/admin", icon: Gauge, label: "管理概览" },
  { href: "/admin/questions", icon: ClipboardList, label: "题库管理" },
  { href: "/admin/products", icon: Boxes, label: "商品管理" },
  { href: "/admin/orders", icon: ShieldCheck, label: "订单管理" },
  { href: "/admin/points", icon: Settings2, label: "积分设置" },
];

function AdminNavigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="管理员主导航" className="sidebar-nav">
      {adminItems.map((item) => {
        const Icon = item.icon;
        return (
          <Link
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
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-shell app-shell--admin">
      <aside className="app-sidebar">
        <Link className="brand" href="/admin">
          <span aria-hidden="true" className="brand__mark brand__mark--admin">
            A
          </span>
          <span>
            <strong>Point Quest</strong>
            <small>运营管理台</small>
          </span>
        </Link>
        <AdminNavigation />
      </aside>

      <div className="app-workspace">
        <header className="app-header">
          <button
            aria-expanded={menuOpen}
            aria-label="打开管理员菜单"
            className="admin-menu-button"
            onClick={() => setMenuOpen(true)}
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
            aria-label="关闭管理员菜单"
            className="admin-drawer-backdrop"
            onClick={() => setMenuOpen(false)}
            type="button"
          />
          <aside aria-label="管理员移动菜单" className="admin-drawer">
            <div className="admin-drawer__header">
              <strong>管理菜单</strong>
              <button
                aria-label="关闭管理员菜单"
                onClick={() => setMenuOpen(false)}
                type="button"
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <AdminNavigation onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
