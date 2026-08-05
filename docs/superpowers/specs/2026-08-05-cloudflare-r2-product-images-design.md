# Cloudflare R2 商品图片上传

**日期：** 2026-08-05  
**状态：** 已确认  

## 目标

生产环境可将商品图写入 Cloudflare R2，并通过公开 CDN 基址直接访问；开发/测试默认仍使用本地磁盘。管理端上传 API、图片校验与 `imageKey` 契约保持不变。

## 非目标

- 浏览器 Presigned 直传 R2
- 私有 Bucket / 签名读 URL
- 存量本地文件迁移到 R2
- 孤儿文件清理、多图 SKU、删除旧图

## 决策摘要

| 项 | 选择 |
|----|------|
| 访问模型 | 公开读 + CDN 直链 |
| 驱动切换 | `STORAGE_DRIVER=local\|r2`（默认 `local`） |
| 上传路径 | 现有服务端中转：校验 → Sharp 规范化 → `StorageProvider.putProductImage` |
| DB 字段 | 仍只存 `imageKey`（`products/{uuid}.{ext}`） |
| Web 读图 | `PRODUCT_IMAGE_PUBLIC_BASE_URL`（或 `NEXT_PUBLIC_*`）运行时注入；有值则拼 CDN，否则 `/uploads/...` |

## 架构

```
Admin UI --multipart--> POST admin/uploads/product-images
                              |
                    validateAndNormalizeProductImage
                              |
                         StorageProvider
                     /                    \
            LocalStorageProvider    R2StorageProvider
                    |                       |
              本地 uploads/            R2 PutObject
                                              |
Store UI <-- productImageUrl(imageKey) -- CDN 或 /uploads 代理
```

## 环境变量

API：

- `STORAGE_DRIVER`：`local`（默认）或 `r2`
- `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_BASE_URL`（`r2` 时全部必填；`R2_PUBLIC_BASE_URL` 无尾斜杠）

Web：

- `PRODUCT_IMAGE_PUBLIC_BASE_URL`（推荐）：与 `R2_PUBLIC_BASE_URL` 对齐；由 root layout 注入 `window`，客户端运行时读取（Docker 改 `.env` 后 recreate web 即可）
- `NEXT_PUBLIC_PRODUCT_IMAGE_BASE_URL`：兼容旧名 / 本地开发回退

R2 S3 endpoint：`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`，`forcePathStyle: true`，`region: auto`。

密钥不得硬编码；仅通过环境变量注入。

## 代码路径

- `apps/api/src/storage/r2-storage.provider.ts`：`PutObject`，返回 `{ key, url }`
- `apps/api/src/storage/storage-config.ts`：解析 driver 与 R2 配置；缺配置则启动失败
- `apps/api/src/storage/storage.module.ts`：按 driver 注入 Provider
- `apps/web/lib/product-image.ts`：CDN base 优先

上传 controller / OpenAPI / `imageKey` 正则不改。

## 错误处理

- R2 `PutObject` 失败：与本地一致的 `STORAGE_ERROR`（不泄露密钥）
- `STORAGE_DRIVER=r2` 但配置不全：模块初始化失败

## 测试

- `R2StorageProvider`：mock S3Client，断言 PutObject 参数与返回值
- `resolveStorageConfig`：默认 local、非法值、r2 缺字段
- Web `productImageUrl`：有/无 base URL
- 默认 local 下既有 local/upload 测试继续通过
