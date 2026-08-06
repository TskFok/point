# 题库管理批量启停删 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 题库列表支持当前页勾选的批量启用、停用、删除，尽力执行并汇总结果。

**Architecture:** 单一 `POST /admin/questions/batch`；服务端一次查出后 `updateMany`/`deleteMany`；前端勾选工具条 + 停用/删除二次确认。

**Tech Stack:** NestJS、Prisma、Next.js、api-client、Jest

## Global Constraints

- 禁止循环内查库
- 业务规则与单条一致（有记录不可启用/删除；启用中不可删）
- 确认弹窗失败保留（`apps/web/AGENTS.md`）

---

## 状态

已实现。设计见 `docs/superpowers/specs/2026-08-06-admin-question-batch-actions-design.md`。
