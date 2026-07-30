# 英语答题积分商城设计规格

## 1. 文档信息

- 产品暂定名：Point Quest
- 目标：构建一个支持管理员与学员角色的多用户英语答题平台，覆盖题库、随机答题、错题重练、积分、商品兑换和订单管理，并为后续 Android App 提供稳定 API。
- 产品形态：响应式 Web 应用 + 独立 REST API。
- 当前范围：实现 Web 与 API；Android App 本身不在本期范围内。

## 2. 已确认的产品规则

### 2.1 角色

系统只有两种角色：

- 管理员：维护题库、积分倍率、商品、库存和订单。
- 学员：随机答题、查看错题、获得积分、兑换商品和查看自己的订单。

学员可使用唯一用户名和密码自行注册。注册接口只能创建学员。管理员账号由初始化配置创建，不能通过公开注册接口获得管理员权限。

### 2.2 首次答题

- “未回答题目”指当前学员从未提交过首次答案的启用题目。
- 服务端只从未回答题目中随机返回题目。
- 无论首次答案正确或错误，提交后该题都退出未回答题池。
- 首次答对获得积分。
- 首次答错不获得积分，并进入错题库。
- 提交后立即显示结果；答错时显示用户答案、正确答案、题目解析和累计错误次数。
- 当所有启用题目均已首次作答时，随机练习页显示完成状态。

### 2.3 错题重练

- 错题库只显示首次答错且尚未掌握的题目。
- 每次重练答错都将错误次数加 1。
- 重练答对后将题目标记为已掌握，并从待练错题列表移除。
- 已掌握题目仍保留历史记录和累计错误次数。
- 错题重练答对不奖励积分，防止重复刷分。

### 2.4 积分

- 每道题拥有正整数基础积分，默认值为 10。
- 管理员可配置全局正整数倍率，范围为 1–10，默认值为 1。
- 首次答对所得积分为：`题目基础积分 × 提交时的全局倍率`。
- 每次首次答题记录都保存实际使用的基础积分与倍率快照；答题奖励流水保存最终奖励。首次答错的 `pointsAwarded` 为 0。后续修改配置不改变历史记录。
- 用户表保存当前余额，积分流水保存每次增加或扣减的原因、变动值和变动后余额。
- 积分余额不得为负。

### 2.5 商品与兑换

- 商品字段包括：名称、描述、图片、库存数量、每件所需积分、上下架状态。
- 每次兑换固定为一件商品，一个兑换请求生成一个订单。
- 兑换前必须同时满足：商品已上架、库存大于 0、学员积分足够。
- 兑换成功时，在同一个数据库事务中完成积分扣减、库存扣减、积分流水写入和订单创建。
- 兑换失败时不产生任何部分扣减。
- 商品图片支持 JPG、PNG、WebP；单文件最大 5 MB。服务端校验文件真实类型，不只信任扩展名。
- 商品更换图片后，仍被历史订单快照引用的图片对象必须保留，不能由商品更新流程删除。

### 2.6 订单

订单状态只有：

- `PENDING_PICKUP`：待领取。
- `COMPLETED`：已完成。
- `CANCELLED`：已取消。

状态流转规则：

- 新订单只能从 `PENDING_PICKUP` 流转到 `COMPLETED` 或 `CANCELLED`。
- `COMPLETED` 和 `CANCELLED` 都是终态。
- 只有管理员可修改订单状态。
- 取消订单时，在同一个数据库事务中退还积分与一件库存，并写入退款积分流水。
- 同一订单只能取消和退款一次。
- 学员只能查看自己的订单；管理员可查看全部订单。
- 订单保存商品名称、图片和兑换积分的快照，商品之后修改或下架不会改变历史订单。

## 3. 系统架构

项目采用 Monorepo，保持前端与 API 的独立部署边界：

```text
apps/
  web/              Next.js 学员端与管理员端
  api/              NestJS REST API
packages/
  api-client/       根据 OpenAPI 生成的类型与请求客户端
  ui/               设计令牌和基础 UI 组件
  config/           共享 TypeScript、Lint 与测试配置
prisma/
  schema.prisma     数据模型
  migrations/       数据库迁移
  seed/             初始化管理员与演示数据
```

基础设施：

- 数据库：PostgreSQL。
- ORM 与迁移：Prisma。
- API：NestJS，统一前缀 `/api/v1`。
- API 契约：OpenAPI/Swagger。
- Web：Next.js。
- 图片存储：通过 `StorageProvider` 抽象。开发环境写入本地上传目录并由 API 提供静态访问；生产环境可切换兼容 S3 的对象存储。
- 本地运行：提供 Docker Compose 启动 PostgreSQL，Web 和 API 可分别启动。

所有题目判定、积分计算、库存修改、订单状态流转和权限规则只存在于 NestJS 服务层。Next.js 和未来 Android App 只调用 API，不复制业务规则。

## 4. 后端模块边界

### 4.1 Auth 模块

职责：

- 学员注册。
- 用户名密码登录。
- Web Cookie 会话。
- Android Access Token 与 Refresh Token。
- 登出、Refresh Token 轮换与撤销。

Web 使用 `HttpOnly`、`Secure`（生产环境）、`SameSite=Lax` Cookie。所有 Cookie 鉴权的写操作同时验证 CSRF Token。API CORS 只允许配置中的 Web Origin。

Android 使用短期 Access Token 和可轮换的 Refresh Token。移动端令牌接口与 Web 登录复用相同的凭据校验和账户状态检查。

### 4.2 Users 模块

职责：

- 当前用户资料与积分余额查询。
- 角色检查。
- 管理员查看用户基本信息。

任何学员查询都从当前认证主体获取用户 ID，不接受客户端传入其他用户 ID 来越权访问资产。

### 4.3 Questions 模块

职责：

- 管理员创建、编辑、启用和停用单选题。
- 校验选项数量为 2–6 个且恰好一个正确答案。
- 保存题干、解析、基础积分和稳定的选项顺序。
- 向学员返回题目时不返回正确答案标记。

已有答题记录的题目不物理删除，只允许停用。

### 4.4 Practice 模块

职责：

- 随机返回当前学员未首次作答的启用题目。
- 提交首次答案。
- 查询错题列表。
- 提交错题重练答案。
- 查询用户个人答题汇总。

当前 Web 页面维护本次打开页面后的随机题目队列。上一题和下一题在该队列中导航；已提交题目切换为只读结果视图。刷新页面后可以开始新的随机顺序，但服务端已提交状态不会丢失。

### 4.5 Points 模块

职责：

- 查询当前余额与积分流水。
- 读取和修改全局积分倍率。
- 为首次正确答案发放积分。
- 为兑换扣减积分。
- 为取消订单退回积分。

积分流水只追加，不编辑和删除。每一笔流水都带有业务引用与唯一约束，避免同一答题或订单重复记账。

### 4.6 Products 模块

职责：

- 管理员创建、编辑、上架和下架商品。
- 上传、更换商品图片。
- 管理库存与兑换积分。
- 向学员返回已上架商品列表。

已有订单引用的商品不物理删除，只允许下架。

### 4.7 Orders 模块

职责：

- 学员兑换一件商品。
- 学员查看自己的订单。
- 管理员筛选并查看全部订单。
- 管理员完成或取消待领取订单。

兑换和取消必须使用数据库事务、幂等键和条件更新，保证并发下积分与库存不为负。

## 5. 数据模型

### 5.1 User

- `id`
- `username`：唯一，大小写规范化后比较。
- `passwordHash`
- `role`：`ADMIN` 或 `STUDENT`
- `pointsBalance`：非负整数
- `isActive`
- `createdAt`
- `updatedAt`

### 5.2 RefreshToken

- `id`
- `userId`
- `tokenHash`
- `clientType`：`WEB` 或 `ANDROID`
- `expiresAt`
- `revokedAt`
- `replacedByTokenId`
- `createdAt`

数据库只保存 Refresh Token 摘要。

### 5.3 Question

- `id`
- `stem`
- `explanation`
- `basePoints`
- `isActive`
- `createdBy`
- `createdAt`
- `updatedAt`

### 5.4 QuestionOption

- `id`
- `questionId`
- `label`
- `content`
- `position`
- `isCorrect`

`questionId + position` 唯一。管理端写入时必须保证每题恰好一个 `isCorrect=true`。

### 5.5 QuestionProgress

- `id`
- `userId`
- `questionId`
- `firstCorrect`
- `errorCount`
- `masteredAt`
- `firstAnsweredAt`
- `updatedAt`

`userId + questionId` 唯一。

状态解释：

- 不存在记录：未首次作答。
- `firstCorrect=true`：首次答对，不进入错题库。
- `firstCorrect=false` 且 `masteredAt=null`：待重练错题。
- `firstCorrect=false` 且 `masteredAt` 非空：已掌握错题。

### 5.6 AnswerAttempt

- `id`
- `userId`
- `questionId`
- `selectedOptionId`
- `mode`：`FIRST_ATTEMPT` 或 `WRONG_RETRY`
- `isCorrect`
- `basePointsSnapshot`
- `multiplierSnapshot`
- `pointsAwarded`
- `balanceAfterSnapshot`：本次答题完成后的余额快照，用于幂等重放时返回原始完整结果
- `errorCountSnapshot`：本次答题结果中的累计错误次数快照，用于错题重练幂等重放
- `idempotencyKey`
- `createdAt`

`userId + idempotencyKey` 唯一。

### 5.7 PointConfig

- `id`
- `multiplier`
- `updatedBy`
- `createdAt`

倍率修改采用追加记录；最新记录为当前生效配置。

### 5.8 PointLedger

- `id`
- `userId`
- `type`：`ANSWER_REWARD`、`ORDER_REDEEM`、`ORDER_REFUND`
- `delta`
- `balanceAfter`
- `answerAttemptId`：可空
- `orderId`：可空
- `createdAt`

答题奖励与 `answerAttemptId` 唯一关联，兑换和退款分别与 `orderId + type` 唯一关联。

### 5.9 Product

- `id`
- `name`
- `description`
- `imageKey`
- `stock`
- `pointsCost`
- `isActive`
- `createdAt`
- `updatedAt`

`stock` 和 `pointsCost` 均为非负整数；上架商品的 `pointsCost` 必须大于 0。

### 5.10 Order

- `id`
- `orderNo`：唯一、不可预测的展示编号。
- `userId`
- `productId`
- `productNameSnapshot`
- `productImageKeySnapshot`
- `pointsCostSnapshot`
- `status`
- `idempotencyKey`
- `createdAt`
- `completedAt`
- `cancelledAt`
- `updatedBy`

`userId + idempotencyKey` 唯一。

## 6. 关键事务与并发规则

### 6.1 首次答题事务

1. 校验题目启用、选项属于题目，并读取当前基础积分与倍率快照。
2. 尝试创建唯一的 `QuestionProgress`。
3. 写入包含基础积分、倍率、最终奖励和答题后余额快照的 `AnswerAttempt`。
4. 若正确，原子增加余额并写入 `PointLedger`。
5. 提交事务后返回结果。

如果同一题已存在首次进度：

- 相同幂等键根据答题记录中的余额快照返回原请求完整结果；即使之后余额变化，重放响应也保持一致。
- 不同幂等键返回 `409 QUESTION_ALREADY_ANSWERED`。

### 6.2 错题重练事务

1. 校验该题存在 `firstCorrect=false` 的进度。
2. 若已掌握，返回 `409 QUESTION_ALREADY_MASTERED`。
3. 写入包含答题后余额与累计错误次数快照的重练 `AnswerAttempt`。
4. 答错时原子增加 `errorCount`；答对时写入 `masteredAt`。
5. 不写入答题奖励积分流水。

重练请求使用相同幂等键重放时，根据答题记录中的快照返回原始完整结果；后续错误次数或余额变化不改变历史响应。

### 6.3 商品兑换事务

1. 校验幂等键。
2. 条件扣减一件启用商品库存，只允许 `stock > 0`。
3. 条件扣减用户积分，只允许 `pointsBalance >= pointsCost`。
4. 写入负数 `PointLedger`。
5. 创建 `PENDING_PICKUP` 订单及商品快照。

任一步失败都回滚。数据库事务使用适合并发资产修改的隔离级别。发生序列化冲突时，服务端返回 `409 CONCURRENT_MODIFICATION`，客户端可使用原幂等键重新提交；服务端不得通过循环执行 SQL 重试，也不得在任何循环遍历中查询 SQL。

### 6.4 订单取消事务

1. 仅允许管理员操作 `PENDING_PICKUP` 订单。
2. 条件更新订单为 `CANCELLED`，保证只成功一次。
3. 原子退回用户积分与一件库存。
4. 写入正数 `ORDER_REFUND` 流水。

任一步失败都回滚。

## 7. API 设计

所有响应使用标准 HTTP 状态码。错误响应结构：

```json
{
  "code": "INSUFFICIENT_POINTS",
  "message": "积分不足，当前还差 120 积分",
  "requestId": "req_xxx",
  "details": {}
}
```

主要接口：

### 7.1 认证

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/token`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

### 7.2 学员练习

- `GET /api/v1/practice/random`
- `POST /api/v1/practice/questions/:questionId/answer`
- `GET /api/v1/practice/wrong-questions`
- `POST /api/v1/practice/wrong-questions/:questionId/answer`
- `GET /api/v1/practice/summary`

### 7.3 学员积分、商城与订单

- `GET /api/v1/points/balance`
- `GET /api/v1/points/ledger`
- `GET /api/v1/products`
- `GET /api/v1/products/:productId`
- `POST /api/v1/orders`
- `GET /api/v1/orders`
- `GET /api/v1/orders/:orderId`

### 7.4 管理端

- `GET /api/v1/admin/questions`
- `POST /api/v1/admin/questions`
- `GET /api/v1/admin/questions/:questionId`
- `PATCH /api/v1/admin/questions/:questionId`
- `GET /api/v1/admin/points/config`
- `PUT /api/v1/admin/points/config`
- `GET /api/v1/admin/products`
- `POST /api/v1/admin/products`
- `PATCH /api/v1/admin/products/:productId`
- `POST /api/v1/admin/uploads/product-images`
- `GET /api/v1/admin/orders`
- `GET /api/v1/admin/orders/:orderId`
- `POST /api/v1/admin/orders/:orderId/complete`
- `POST /api/v1/admin/orders/:orderId/cancel`

列表接口统一支持分页。管理端题目、商品和订单支持搜索、状态筛选与稳定排序。

## 8. Web 页面与路由

### 8.1 公共页面

- `/login`：登录。
- `/register`：学员注册。

### 8.2 学员端

- `/learn`：学习首页，展示积分、首次答题进度、待重练错题数和主要行动入口。
- `/learn/practice`：随机练习、上下题、提交与结果反馈。
- `/learn/wrong-questions`：错题列表、错误次数和重练入口。
- `/learn/store`：商品网格、库存、所需积分和兑换确认。
- `/learn/orders`：自己的订单列表与状态。
- `/learn/profile`：账户信息、积分余额与流水。

### 8.3 管理端

- `/admin`：运营概览。
- `/admin/questions`：题库列表。
- `/admin/questions/new`：添加题目。
- `/admin/questions/:questionId`：编辑题目。
- `/admin/points`：积分倍率配置与历史。
- `/admin/products`：商品与库存管理。
- `/admin/orders`：订单列表、筛选和状态操作。

桌面端使用侧边导航。移动端学员页面使用不超过五项的底部主导航：学习、练习、错题、商城、订单；个人中心从顶部头像进入。移动端管理页使用顶部栏和抽屉导航。

## 9. 视觉系统

视觉方向为用户确认的“游戏化成长”：

- 主色：紫色，用于品牌、主要按钮和选中状态。
- 奖励强调色：暖黄色，用于积分、倍率和成就反馈。
- 成功色：绿色；错误色：红色。状态除颜色外必须同时使用图标和文字。
- 组件：圆角卡片、轻量层次阴影、清晰边框，不使用过度玻璃效果。
- 图标：统一使用 Lucide 风格 SVG，不使用 Emoji 作为结构图标。
- 字体：中文采用系统无衬线字体栈；英文标题和数字可使用圆润字体增强游戏感。
- 间距：4/8 px 体系。
- 动效：150–300 ms，只用于提交反馈、状态变化和奖励出现；支持 `prefers-reduced-motion`。
- 正文最小 16 px，普通文本对比度至少 4.5:1。
- 所有交互目标至少 44 × 44 px，有清晰 Hover、Pressed、Disabled 和 Focus 状态。
- 验证宽度：375、768、1024、1440 px；禁止移动端横向滚动。

`design-system/point-english/MASTER.md` 作为实现参考，但自动生成内容中的错误产品分类和横向营销页模式不适用于本项目，以本规格为最高优先级。

## 10. 错误处理与可恢复性

- 表单在字段附近显示具体错误原因和修复方式。
- 异步提交期间禁用重复操作并显示加载状态。
- 网络超时保留表单与已选答案，并提供重试操作。
- 上传失败保留商品其他字段。
- 兑换前显示商品、积分和余额确认；积分或库存变化时返回最新数据。
- 订单取消使用确认对话框。
- 空题池、空错题库、空商城和空订单都有说明与下一步操作。
- Toast 在 3–5 秒自动消失，通过 `aria-live="polite"` 宣告且不抢夺键盘焦点。
- API 返回稳定错误码，包括但不限于：
  - `AUTH_INVALID_CREDENTIALS`
  - `AUTH_TOKEN_EXPIRED`
  - `FORBIDDEN`
  - `VALIDATION_FAILED`
  - `QUESTION_ALREADY_ANSWERED`
  - `QUESTION_ALREADY_MASTERED`
  - `NO_UNANSWERED_QUESTIONS`
  - `INSUFFICIENT_POINTS`
  - `OUT_OF_STOCK`
  - `PRODUCT_INACTIVE`
  - `ORDER_INVALID_STATUS`
  - `IDEMPOTENCY_CONFLICT`
  - `CONCURRENT_MODIFICATION`

## 11. 测试策略

所有行为采用测试驱动方式实现：先编写失败测试并验证失败原因，再写最小实现使其通过。

### 11.1 单元测试

- 基础积分与倍率计算。
- 首次答案和错题重练状态判断。
- 错误次数累计与掌握状态。
- 订单状态机。
- API 参数校验与错误码映射。

### 11.2 API 集成测试

- 注册、登录、刷新、注销。
- 学员和管理员权限隔离。
- 随机题目不泄露正确答案。
- 首次答对只奖励一次。
- 首次答错进入错题库并累计错误次数。
- 错题答对标记掌握且不奖励积分。
- 商品兑换、积分流水和订单创建。
- 完成与取消订单。
- 学员不能访问他人订单。
- 图片上传类型与大小限制。

### 11.3 并发与事务测试

- 两个首次答题请求不能重复发放积分。
- 两个兑换请求不能让库存或积分变为负数。
- 同一幂等键重复请求只产生一个订单。
- 两个取消请求只产生一次退款。
- 事务任一步失败时没有部分写入。

### 11.4 Web 端到端测试

- 管理员登录并添加题目。
- 管理员配置积分倍率。
- 学员注册、首次答题、查看结果和积分。
- 学员答错、进入错题库、重练并掌握。
- 管理员添加含图片的商品。
- 学员兑换商品并查看订单。
- 管理员完成或取消订单。

### 11.5 交付验证

- 单元、集成和端到端测试全部通过。
- TypeScript 类型检查通过。
- Lint 通过。
- Web 与 API 生产构建通过。
- PostgreSQL 迁移可从空库执行。
- 演示种子可创建一个管理员、一个学员、至少 10 道英语单选题和 3 件商品。
- 375、768、1024、1440 px 页面完成视觉检查。
- 键盘导航、焦点可见性、屏幕阅读器标签和减少动画设置完成检查。

## 12. 不在本期范围

- Android 客户端界面与安装包。
- 邮箱验证、找回密码和第三方登录。
- 在线支付、现金支付、物流和配送地址。
- 多商品购物车或一个订单兑换多件商品。
- 排行榜、好友、等级体系和连续签到奖励。
- 题目批量导入、AI 自动出题和多题型。
- 多租户、学校或班级管理。

这些能力可在后续迭代中通过现有 API 和模块边界扩展，不进入本期实现计划。

## 13. 验收结果

本期完成后，管理员可以从空系统开始添加题目、配置倍率、添加商品并处理订单；学员可以注册、随机完成未答题目、查看与重练错题、获得可审计积分、兑换一件商品并查看订单。所有资产修改在并发条件下保持积分、库存和订单一致，Web 与未来 Android App 共享同一套版本化 API。
