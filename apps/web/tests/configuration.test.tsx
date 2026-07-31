import nextConfig from "../next.config";

type Rewrite = { destination: string; source: string };

async function getRewrites(): Promise<Rewrite[]> {
  if (typeof nextConfig.rewrites !== "function") return [];
  const rewrites = await nextConfig.rewrites();
  return Array.isArray(rewrites) ? (rewrites as Rewrite[]) : [];
}

describe("Web API 同源代理配置", () => {
  const originalServerBaseUrl = process.env.API_SERVER_BASE_URL;

  afterEach(() => {
    if (originalServerBaseUrl === undefined) {
      delete process.env.API_SERVER_BASE_URL;
    } else {
      process.env.API_SERVER_BASE_URL = originalServerBaseUrl;
    }
  });

  it("默认把同源 /api/v1 完整转发到独立 Nest API", async () => {
    delete process.env.API_SERVER_BASE_URL;

    await expect(getRewrites()).resolves.toContainEqual({
      source: "/api/v1/:path*",
      destination: "http://localhost:3000/api/v1/:path*",
    });
  });

  it("规范化运行时 API 地址尾斜杠且不丢失 /api/v1", async () => {
    process.env.API_SERVER_BASE_URL = "http://nest-api:4000/api/v1///";

    await expect(getRewrites()).resolves.toContainEqual({
      source: "/api/v1/:path*",
      destination: "http://nest-api:4000/api/v1/:path*",
    });
  });
});
