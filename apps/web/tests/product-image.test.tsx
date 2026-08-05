import { productImageUrl } from "@/lib/product-image";

describe("商品图片地址", () => {
  const originalNextPublic = process.env.NEXT_PUBLIC_PRODUCT_IMAGE_BASE_URL;
  const originalRuntime = process.env.PRODUCT_IMAGE_PUBLIC_BASE_URL;
  const originalWindowBase = window.__POINT_PRODUCT_IMAGE_BASE_URL__;

  afterEach(() => {
    if (originalNextPublic === undefined) {
      delete process.env.NEXT_PUBLIC_PRODUCT_IMAGE_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_PRODUCT_IMAGE_BASE_URL = originalNextPublic;
    }
    if (originalRuntime === undefined) {
      delete process.env.PRODUCT_IMAGE_PUBLIC_BASE_URL;
    } else {
      process.env.PRODUCT_IMAGE_PUBLIC_BASE_URL = originalRuntime;
    }
    if (originalWindowBase === undefined) {
      delete window.__POINT_PRODUCT_IMAGE_BASE_URL__;
    } else {
      window.__POINT_PRODUCT_IMAGE_BASE_URL__ = originalWindowBase;
    }
  });

  it.each(["jpg", "png", "webp"])(
    "未配置 CDN 时仅允许后端图片代理接受的 UUID v4 %s 商品键",
    (extension) => {
      delete process.env.NEXT_PUBLIC_PRODUCT_IMAGE_BASE_URL;
      delete process.env.PRODUCT_IMAGE_PUBLIC_BASE_URL;
      delete window.__POINT_PRODUCT_IMAGE_BASE_URL__;
      expect(
        productImageUrl(
          `products/550e8400-e29b-41d4-a716-446655440000.${extension}`,
        ),
      ).toBe(
        `/uploads/products/550e8400-e29b-41d4-a716-446655440000.${extension}`,
      );
    },
  );

  it("优先使用 window 运行时注入的 CDN 基址", () => {
    delete process.env.NEXT_PUBLIC_PRODUCT_IMAGE_BASE_URL;
    delete process.env.PRODUCT_IMAGE_PUBLIC_BASE_URL;
    window.__POINT_PRODUCT_IMAGE_BASE_URL__ = "https://point-img.adiosat.com/";
    expect(
      productImageUrl("products/550e8400-e29b-41d4-a716-446655440000.png"),
    ).toBe(
      "https://point-img.adiosat.com/products/550e8400-e29b-41d4-a716-446655440000.png",
    );
  });

  it("配置 CDN 基址时拼绝对 URL 并去掉尾斜杠", () => {
    delete window.__POINT_PRODUCT_IMAGE_BASE_URL__;
    delete process.env.PRODUCT_IMAGE_PUBLIC_BASE_URL;
    process.env.NEXT_PUBLIC_PRODUCT_IMAGE_BASE_URL = "https://cdn.example.com/";
    expect(
      productImageUrl("products/550e8400-e29b-41d4-a716-446655440000.png"),
    ).toBe(
      "https://cdn.example.com/products/550e8400-e29b-41d4-a716-446655440000.png",
    );
  });

  it.each([
    "seed/products/vocabulary-notebook.png",
    "products/not-a-uuid.png",
    "products/550e8400-e29b-41d4-a716-446655440000.svg",
    "../products/550e8400-e29b-41d4-a716-446655440000.png",
  ])("无效或旧版图片键 %s 使用本地占位图", (imageKey) => {
    window.__POINT_PRODUCT_IMAGE_BASE_URL__ = "https://cdn.example.com";
    expect(productImageUrl(imageKey)).toBe("/file.svg");
  });
});
