import Image from "next/image";

import {
  isAbsoluteProductImageUrl,
  productImageUrl,
} from "@/lib/product-image";

type ProductImageProps = {
  alt: string;
  className?: string;
  height: number;
  imageKey: string;
  sizes?: string;
  width: number;
};

export function ProductImage({
  alt,
  className,
  height,
  imageKey,
  sizes,
  width,
}: ProductImageProps) {
  const src = productImageUrl(imageKey);
  return (
    <Image
      alt={alt}
      className={className}
      height={height}
      sizes={sizes}
      src={src}
      unoptimized={isAbsoluteProductImageUrl(src)}
      width={width}
    />
  );
}
