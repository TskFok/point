import type { ApiComponents } from "@point-quest/api-client";
import { Card } from "@point-quest/ui";
import { Ban, CircleCheck, Clock3, Coins } from "lucide-react";
import Image from "next/image";

import { productImageUrl } from "@/lib/product-image";

type Order = ApiComponents["schemas"]["OrderDto"];

const statusPresentation = {
  CANCELLED: {
    icon: Ban,
    iconLabel: "已取消状态图标",
    label: "已取消",
  },
  COMPLETED: {
    icon: CircleCheck,
    iconLabel: "已完成状态图标",
    label: "已完成",
  },
  PENDING_PICKUP: {
    icon: Clock3,
    iconLabel: "待领取状态图标",
    label: "待领取",
  },
} satisfies Record<
  Order["status"],
  { icon: typeof Ban; iconLabel: string; label: string }
>;

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function OrderCard({ order }: { order: Order }) {
  const status = statusPresentation[order.status];
  const StatusIcon = status.icon;

  return (
    <Card className="order-card">
      <div className="order-card__image">
        <Image
          alt={order.productNameSnapshot}
          height={240}
          sizes="8rem"
          src={productImageUrl(order.productImageKeySnapshot)}
          width={320}
        />
      </div>
      <div className="order-card__content">
        <div className="order-card__heading">
          <div>
            <p>订单号</p>
            <strong>{order.orderNo}</strong>
          </div>
          <span
            className={`order-status order-status--${order.status.toLowerCase()}`}
          >
            <StatusIcon aria-label={status.iconLabel} role="img" />
            {status.label}
          </span>
        </div>
        <h2>{order.productNameSnapshot}</h2>
        <div className="order-card__details">
          <span>
            <Coins aria-hidden="true" />
            花费 {order.pointsCostSnapshot} 积分
          </span>
          <time dateTime={order.createdAt}>
            {dateTimeFormatter.format(new Date(order.createdAt))}
          </time>
        </div>
      </div>
    </Card>
  );
}
