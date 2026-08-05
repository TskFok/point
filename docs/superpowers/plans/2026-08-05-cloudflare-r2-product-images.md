# Cloudflare R2 商品图片上传 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 生产可将商品图写入 Cloudflare R2 并经公开 CDN 访问；本地默认仍用磁盘。

**Architecture:** 保留管理端上传 API 与校验；新增 `R2StorageProvider`；`STORAGE_DRIVER` 切换；Web 用公开基址拼 CDN。

**Tech Stack:** NestJS、`@aws-sdk/client-s3`、现有 `StorageProvider`、Next.js `productImageUrl`。

详见已确认规格：`docs/superpowers/specs/2026-08-05-cloudflare-r2-product-images-design.md`。

## Tasks

1. 设计文档 + 安装 `@aws-sdk/client-s3`
2. TDD：`R2StorageProvider`
3. `storage-config` + `StorageModule` 切换
4. Web `productImageUrl` + 单测
5. `.env.example` / `.env.docker.example` / compose / 部署文档
6. 跑通相关单元测试
