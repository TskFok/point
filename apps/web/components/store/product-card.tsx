import type { ApiComponents } from "@point-quest/api-client";
import { Button, Card } from "@point-quest/ui";
import { Coins, Package, ShoppingBag } from "lucide-react";
import Image from "next/image";

import { productImageUrl } from "@/lib/product-image";

type Product = ApiComponents["schemas"]["ProductDto"];

type ProductCardProps = {
  balance: number;
  deficit?: number;
  onRedeem: (product: Product) => void;
  product: Product;
};

export function ProductCard({
  balance,
  deficit,
  onRedeem,
  product,
}: ProductCardProps) {
  const outOfStock = product.stock <= 0;
  const affordable = balance >= product.pointsCost;

  return (
    <Card className="product-card">
      <div className="product-card__image">
        <Image
          alt={product.name}
          height={600}
          sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 33vw"
          src={productImageUrl(product.imageKey)}
          width={800}
        />
        <span
          className={
            outOfStock
              ? "stock-badge stock-badge--empty"
              : "stock-badge"
          }
        >
          <Package aria-hidden="true" />
          {outOfStock ? "已售罄" : `库存 ${product.stock}`}
        </span>
      </div>
      <div className="product-card__body">
        <div>
          <h2>{product.name}</h2>
          <p>{product.description}</p>
        </div>
        <div className="product-card__cost">
          <Coins aria-hidden="true" />
          <strong>{product.pointsCost}</strong>
          <span>积分</span>
        </div>
        <Button
          disabled={outOfStock}
          fullWidth
          onClick={() => onRedeem(product)}
          variant={affordable ? "primary" : "secondary"}
        >
          <ShoppingBag aria-hidden="true" />
          {outOfStock ? "暂时无库存" : `兑换 ${product.pointsCost} 积分`}
        </Button>
        {deficit ? (
          <p className="product-card__deficit" role="status">
            还差 {deficit} 积分
          </p>
        ) : null}
      </div>
    </Card>
  );
}
