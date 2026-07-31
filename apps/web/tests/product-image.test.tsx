import { productImageUrl } from "@/lib/product-image";

describe("商品图片地址", () => {
  it.each(["jpg", "png", "webp"])(
    "仅允许后端图片代理接受的 UUID v4 %s 商品键",
    (extension) => {
      expect(
        productImageUrl(
          `products/550e8400-e29b-41d4-a716-446655440000.${extension}`,
        ),
      ).toBe(
        `/uploads/products/550e8400-e29b-41d4-a716-446655440000.${extension}`,
      );
    },
  );

  it.each([
    "seed/products/vocabulary-notebook.png",
    "products/not-a-uuid.png",
    "products/550e8400-e29b-41d4-a716-446655440000.svg",
    "../products/550e8400-e29b-41d4-a716-446655440000.png",
  ])("无效或旧版图片键 %s 使用本地占位图", (imageKey) => {
    expect(productImageUrl(imageKey)).toBe("/file.svg");
  });
});
