import Link from "next/link";
import type { ComponentType, SVGProps } from "react";

export type NavigationItem = {
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
};

type MobileNavProps = {
  currentPath?: string;
  items: NavigationItem[];
};

export function MobileNav({ currentPath, items }: MobileNavProps) {
  return (
    <nav aria-label="学员移动导航" className="mobile-bottom-nav">
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          currentPath === item.href ||
          (item.href !== "/learn" &&
            currentPath?.startsWith(`${item.href}/`));

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className="mobile-bottom-nav__link"
            href={item.href}
            key={item.href}
          >
            <Icon aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
