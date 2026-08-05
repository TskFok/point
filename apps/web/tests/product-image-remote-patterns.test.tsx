import { productImageRemotePatterns } from "@/lib/product-image-remote-patterns";

describe("productImageRemotePatterns", () => {
  it("空基址返回空列表", () => {
    expect(productImageRemotePatterns(undefined)).toEqual([]);
    expect(productImageRemotePatterns("")).toEqual([]);
  });

  it("从 CDN 基址生成 remotePattern", () => {
    expect(
      productImageRemotePatterns("https://pub-abc.r2.dev/"),
    ).toEqual([
      {
        protocol: "https",
        hostname: "pub-abc.r2.dev",
        port: undefined,
        pathname: "/**",
      },
    ]);
  });

  it("非法 URL 返回空列表", () => {
    expect(productImageRemotePatterns("not-a-url")).toEqual([]);
  });
});
