"use client";

import {
  BookOpen,
  BookOpenCheck,
  CircleDollarSign,
  ClipboardList,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import {
  POINT_BALANCE_EVENT,
  pointBalanceFromEvent,
} from "@/lib/point-balance-event";

import { LogoutButton } from "./logout-button";
import { MobileNav, type NavigationItem } from "./mobile-nav";

const studentItems: NavigationItem[] = [
  { href: "/learn", icon: Sparkles, label: "学习" },
  { href: "/learn/practice", icon: BookOpen, label: "练习" },
  { href: "/learn/wrong-questions", icon: BookOpenCheck, label: "错题" },
  { href: "/learn/store", icon: ShoppingBag, label: "商城" },
  { href: "/learn/orders", icon: ClipboardList, label: "订单" },
];

type StudentShellProps = {
  children: ReactNode;
  currentPath?: string;
  user: {
    pointsBalance: number;
    username: string;
  };
};

export function StudentShell({
  children,
  currentPath,
  user,
}: StudentShellProps) {
  const pathname = usePathname();
  const activePath = currentPath ?? pathname;
  const [pointsBalance, setPointsBalance] = useState(user.pointsBalance);

  useEffect(() => {
    function updateBalance(event: Event) {
      const balance = pointBalanceFromEvent(event);
      if (balance !== null) setPointsBalance(balance);
    }

    window.addEventListener(POINT_BALANCE_EVENT, updateBalance);
    return () => {
      window.removeEventListener(POINT_BALANCE_EVENT, updateBalance);
    };
  }, []);

  return (
    <div className="app-shell app-shell--student">
      <aside className="app-sidebar">
        <Link className="brand" href="/learn">
          <span aria-hidden="true" className="brand__mark">
            P
          </span>
          <span>
            <strong>Point Quest</strong>
            <small>英语成长站</small>
          </span>
        </Link>
        <nav aria-label="学员主导航" className="sidebar-nav">
          {studentItems.map((item) => {
            const Icon = item.icon;
            const active =
              activePath === item.href ||
              (item.href !== "/learn" &&
                activePath.startsWith(`${item.href}/`));
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className="sidebar-nav__link"
                href={item.href}
                key={item.href}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-tip">
            <Sparkles aria-hidden="true" />
            <p>每一次认真作答，都在为目标积蓄能量。</p>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <div className="app-workspace">
        <header className="app-header">
          <Link className="profile-link" href="/learn/profile">
            <p className="app-header__eyebrow">今天也向前一步</p>
            <strong>{user.username}</strong>
          </Link>
          <div aria-label={`当前积分 ${pointsBalance}`} className="point-chip">
            <CircleDollarSign aria-hidden="true" />
            <span>{pointsBalance}</span>
            <small>积分</small>
          </div>
        </header>
        <main className="app-content">{children}</main>
      </div>

      <MobileNav currentPath={activePath} items={studentItems} />
    </div>
  );
}
