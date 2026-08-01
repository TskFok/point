#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

test_database_url="${TEST_DATABASE_URL:-postgresql://point:point@localhost:5433/point_test}"
if [[ ! "$test_database_url" =~ ^postgres(ql)?://[^/?#]+@(localhost|127\.0\.0\.1):5433/point_test$ ]]; then
  echo "验证中止：TEST_DATABASE_URL 必须精确指向 localhost:5433/point_test" >&2
  exit 2
fi

export DATABASE_URL="$test_database_url"
export TEST_DATABASE_URL="$test_database_url"

echo "[1/9] 部署 point_test 迁移并清理业务数据"
node scripts/clean-test-database.mjs

echo "[2/9] 生成 OpenAPI 与 TypeScript 客户端并检查零差异"
pnpm api:spec
pnpm api:client
git diff --exit-code -- openapi/openapi.json packages/api-client/src/schema.ts
pnpm --filter @point-quest/api-client build

echo "[3/9] 运行 Lint"
pnpm lint

echo "[4/9] 运行 TypeScript 类型检查"
pnpm typecheck

echo "[5/9] 验证 Playwright 测试发现"
pnpm test:e2e:list

echo "[6/9] 运行全部单元测试"
pnpm test

echo "[7/9] 运行 API 数据库 E2E"
pnpm --filter @point-quest/api test:e2e

echo "[8/9] 运行 Playwright 浏览器 E2E"
pnpm test:e2e

echo "[9/9] 运行生产构建"
pnpm build
