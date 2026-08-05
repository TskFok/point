import { productImageRuntimeBootstrapScript } from "@/lib/product-image-base-url";

/** 把容器运行时的公开图基址注入到 window，供客户端 productImageUrl 使用。 */
export function ProductImageRuntimeConfig() {
  const script = productImageRuntimeBootstrapScript();
  return (
    <script
      dangerouslySetInnerHTML={{ __html: script }}
      id="point-product-image-runtime-config"
    />
  );
}
