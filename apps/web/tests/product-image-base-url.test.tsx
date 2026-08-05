import {
  productImageRuntimeBootstrapScript,
  resolveProductImagePublicBaseUrlFromEnv,
} from "@/lib/product-image-base-url";

describe("product-image-base-url", () => {
  it("优先 PRODUCT_IMAGE_PUBLIC_BASE_URL", () => {
    expect(
      resolveProductImagePublicBaseUrlFromEnv({
        PRODUCT_IMAGE_PUBLIC_BASE_URL: "https://a.example/",
        NEXT_PUBLIC_PRODUCT_IMAGE_BASE_URL: "https://b.example",
      }),
    ).toBe("https://a.example");
  });

  it("回退 NEXT_PUBLIC_PRODUCT_IMAGE_BASE_URL", () => {
    expect(
      resolveProductImagePublicBaseUrlFromEnv({
        NEXT_PUBLIC_PRODUCT_IMAGE_BASE_URL: "https://b.example/",
      }),
    ).toBe("https://b.example");
  });

  it("生成可注入的 bootstrap 脚本", () => {
    expect(productImageRuntimeBootstrapScript("https://point-img.adiosat.com")).toBe(
      'window.__POINT_PRODUCT_IMAGE_BASE_URL__="https://point-img.adiosat.com";',
    );
  });
});
