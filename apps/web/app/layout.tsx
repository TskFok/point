import type { Metadata } from "next";
import "@point-quest/ui/tokens.css";
import "./globals.css";

import { ToastProvider } from "@/components/feedback/toast-region";
import { ProductImageRuntimeConfig } from "@/components/providers/product-image-runtime-config";
import { QueryProvider } from "@/components/providers/query-provider";

export const metadata: Metadata = {
  title: {
    default: "Point Quest",
    template: "%s · Point Quest",
  },
  description: "通过英语挑战积累积分、复习错题并兑换奖励。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <ProductImageRuntimeConfig />
        <QueryProvider>
          <ToastProvider>{children}</ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
