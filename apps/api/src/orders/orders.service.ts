import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { isISO8601 } from 'class-validator';
import { PointsService } from '../points/points.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  type ListAdminOrdersDto,
  type ListOrdersDto,
} from './dto/list-orders.dto';
import { generateOrderNumber } from './order-number';

const MAX_ID_LENGTH = 191;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const MAX_DATABASE_INTEGER = 2_147_483_647;
const ZONED_ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const learnerOrderSelection = {
  id: true,
  orderNo: true,
  userId: true,
  productId: true,
  productNameSnapshot: true,
  productImageKeySnapshot: true,
  pointsCostSnapshot: true,
  status: true,
  createdAt: true,
  completedAt: true,
  cancelledAt: true,
  updatedBy: true,
  pointLedgers: {
    where: { type: 'ORDER_REDEEM' as const },
    select: { balanceAfter: true },
    take: 1,
  },
} satisfies Prisma.OrderSelect;

const adminOrderSelection = {
  ...learnerOrderSelection,
  user: {
    select: {
      id: true,
      username: true,
    },
  },
} satisfies Prisma.OrderSelect;

type LearnerOrderRecord = Prisma.OrderGetPayload<{
  select: typeof learnerOrderSelection;
}>;

type AdminOrderRecord = Prisma.OrderGetPayload<{
  select: typeof adminOrderSelection;
}>;

type OrderClient = PrismaService | Prisma.TransactionClient;

function validationFailed(message: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    message,
  });
}

function productNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'PRODUCT_NOT_FOUND',
    message: '商品不存在',
  });
}

function orderNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'ORDER_NOT_FOUND',
    message: '订单不存在',
  });
}

function insufficientPoints(current: number, required: number) {
  return new ConflictException({
    code: 'INSUFFICIENT_POINTS',
    message: `积分不足，当前还差 ${Math.max(required - current, 0)} 积分`,
    details: {
      balance: current,
      required,
    },
  });
}

function outOfStock(): ConflictException {
  return new ConflictException({
    code: 'OUT_OF_STOCK',
    message: '商品库存不足',
  });
}

function productInactive(): ConflictException {
  return new ConflictException({
    code: 'PRODUCT_INACTIVE',
    message: '商品已下架，暂时无法兑换',
  });
}

function orderInvalidStatus(status?: OrderStatus): ConflictException {
  return new ConflictException({
    code: 'ORDER_INVALID_STATUS',
    message: '只有待领取订单可以执行该操作',
    details: status ? { status } : {},
  });
}

function idempotencyConflict(): ConflictException {
  return new ConflictException({
    code: 'IDEMPOTENCY_CONFLICT',
    message: '幂等键已用于不同的兑换请求',
  });
}

function concurrentModification(): ConflictException {
  return new ConflictException({
    code: 'CONCURRENT_MODIFICATION',
    message: '订单或资产正被其他请求修改，请使用原幂等键重试',
  });
}

function normalizeBoundedString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== 'string') {
    throw validationFailed(`${fieldName}不能为空`);
  }
  const normalized = value.trim();
  if (!normalized || Array.from(normalized).length > maxLength) {
    throw validationFailed(`${fieldName}长度必须为 1–${maxLength} 个字符`);
  }
  return normalized;
}

function normalizePage(query: ListOrdersDto): {
  page: number;
  pageSize: number;
} {
  if (
    !Number.isInteger(query.page) ||
    query.page < 1 ||
    query.page > 100_000 ||
    !Number.isInteger(query.pageSize) ||
    query.pageSize < 1 ||
    query.pageSize > 100
  ) {
    throw validationFailed('订单分页参数无效');
  }
  return { page: query.page, pageSize: query.pageSize };
}

function normalizeOptionalFilter(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string | undefined {
  return value === undefined
    ? undefined
    : normalizeBoundedString(value, fieldName, maxLength);
}

function normalizeDate(value: unknown, fieldName: string): Date | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = normalizeBoundedString(value, fieldName, 40);
  if (
    !ZONED_ISO_TIMESTAMP_PATTERN.test(normalized) ||
    !isISO8601(normalized, { strict: true, strictSeparator: true })
  ) {
    throw validationFailed(`${fieldName}必须是带时区的完整 ISO 8601 时间点`);
  }
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) {
    throw validationFailed(`${fieldName}必须是有效的 ISO 8601 日期时间`);
  }
  return date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

function isUniqueConflictFor(
  error: unknown,
  modelName: string,
  fields: string[],
  constraintName: string,
): boolean {
  if (!isRecord(error) || error.code !== 'P2002' || !isRecord(error.meta)) {
    return false;
  }
  if (error.meta.modelName !== modelName) {
    return false;
  }
  const driverError = error.meta.driverAdapterError;
  const driverCause = isRecord(driverError) ? driverError.cause : undefined;
  const driverConstraint = isRecord(driverCause)
    ? driverCause.constraint
    : undefined;
  const target =
    error.meta.target ??
    (isRecord(driverConstraint) ? driverConstraint.fields : undefined);
  if (Array.isArray(target)) {
    const targetFields = target
      .filter((field): field is string => typeof field === 'string')
      .map((field) => field.replace(/^"|"$/g, ''));
    return (
      targetFields.length === fields.length &&
      fields.every((field) => targetFields.includes(field))
    );
  }
  return typeof target === 'string' && target === constraintName;
}

export function isOrderIdempotencyUniqueConflict(error: unknown): boolean {
  return isUniqueConflictFor(
    error,
    'Order',
    ['userId', 'idempotencyKey'],
    'Order_userId_idempotencyKey_key',
  );
}

function isOrderNumberUniqueConflict(error: unknown): boolean {
  return isUniqueConflictFor(error, 'Order', ['orderNo'], 'Order_orderNo_key');
}

function isRefundLedgerUniqueConflict(error: unknown): boolean {
  return isUniqueConflictFor(
    error,
    'PointLedger',
    ['orderId', 'type'],
    'PointLedger_orderId_type_key',
  );
}

export type OrderDatabaseConflict =
  | 'ORDER_IDEMPOTENCY'
  | 'ORDER_NUMBER'
  | 'REFUND_LEDGER'
  | 'SERIALIZATION'
  | 'DEADLOCK';

export function classifyOrderDatabaseConflict(
  error: unknown,
): OrderDatabaseConflict | null {
  if (isOrderIdempotencyUniqueConflict(error)) {
    return 'ORDER_IDEMPOTENCY';
  }
  if (isOrderNumberUniqueConflict(error)) {
    return 'ORDER_NUMBER';
  }
  if (isRefundLedgerUniqueConflict(error)) {
    return 'REFUND_LEDGER';
  }
  if (hasPrismaCode(error, 'P2034')) {
    return 'SERIALIZATION';
  }
  if (!isRecord(error) || error.code !== 'P2010' || !isRecord(error.meta)) {
    return null;
  }
  const driverError = error.meta.driverAdapterError;
  const cause = isRecord(driverError) ? driverError.cause : undefined;
  if (!isRecord(cause)) {
    return null;
  }
  if (
    cause.kind === 'TransactionWriteConflict' &&
    cause.originalCode === '40001'
  ) {
    return 'SERIALIZATION';
  }
  if (cause.originalCode === '40P01') {
    return 'DEADLOCK';
  }
  return null;
}

function mapLearnerOrder(order: LearnerOrderRecord) {
  const { pointLedgers, ...data } = order;
  const redeemLedger = pointLedgers[0];
  if (!redeemLedger) {
    throw concurrentModification();
  }
  return {
    ...data,
    balance: redeemLedger.balanceAfter,
  };
}

function mapAdminOrder(order: AdminOrderRecord) {
  const { pointLedgers, ...data } = order;
  const redeemLedger = pointLedgers[0];
  if (!redeemLedger) {
    throw concurrentModification();
  }
  return {
    ...data,
    balance: redeemLedger.balanceAfter,
  };
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pointsService: PointsService,
  ) {}

  async redeem(userId: string, productId: string, idempotencyKey: unknown) {
    const normalizedUserId = normalizeBoundedString(
      userId,
      '用户 ID',
      MAX_ID_LENGTH,
    );
    const normalizedProductId = normalizeBoundedString(
      productId,
      '商品 ID',
      MAX_ID_LENGTH,
    );
    const normalizedKey = normalizeBoundedString(
      idempotencyKey,
      'Idempotency-Key',
      MAX_IDEMPOTENCY_KEY_LENGTH,
    );

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const replay = await this.findReplay(
            tx,
            normalizedUserId,
            normalizedProductId,
            normalizedKey,
          );
          if (replay) {
            return replay;
          }

          const product = await tx.product.findUnique({
            where: { id: normalizedProductId },
            select: {
              id: true,
              name: true,
              imageKey: true,
              stock: true,
              pointsCost: true,
              isActive: true,
            },
          });
          if (!product) {
            throw productNotFound();
          }
          if (!product.isActive || product.pointsCost <= 0) {
            throw productInactive();
          }
          if (product.stock <= 0) {
            throw outOfStock();
          }

          const user = await tx.user.findUnique({
            where: { id: normalizedUserId },
            select: { pointsBalance: true },
          });
          if (!user) {
            throw new NotFoundException({
              code: 'USER_NOT_FOUND',
              message: '用户不存在',
            });
          }
          if (user.pointsBalance < product.pointsCost) {
            throw insufficientPoints(user.pointsBalance, product.pointsCost);
          }

          const products = await tx.product.updateManyAndReturn({
            where: {
              id: product.id,
              name: product.name,
              imageKey: product.imageKey,
              pointsCost: product.pointsCost,
              isActive: true,
              stock: { gt: 0 },
            },
            data: { stock: { decrement: 1 } },
            select: { id: true },
            limit: 1,
          });
          if (products.length !== 1) {
            throw concurrentModification();
          }

          const balanceAfter = await this.pointsService.debitForOrder(
            tx,
            normalizedUserId,
            product.pointsCost,
          );
          if (balanceAfter === null) {
            throw concurrentModification();
          }

          const order = await tx.order.create({
            data: {
              orderNo: generateOrderNumber(),
              userId: normalizedUserId,
              productId: product.id,
              productNameSnapshot: product.name,
              productImageKeySnapshot: product.imageKey,
              pointsCostSnapshot: product.pointsCost,
              idempotencyKey: normalizedKey,
            },
            select: {
              id: true,
              orderNo: true,
              userId: true,
              productId: true,
              productNameSnapshot: true,
              productImageKeySnapshot: true,
              pointsCostSnapshot: true,
              status: true,
              createdAt: true,
              completedAt: true,
              cancelledAt: true,
              updatedBy: true,
            },
          });
          await tx.pointLedger.create({
            data: {
              userId: normalizedUserId,
              type: 'ORDER_REDEEM',
              delta: -product.pointsCost,
              balanceAfter,
              orderId: order.id,
            },
          });
          return {
            ...order,
            balance: balanceAfter,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 10_000,
        },
      );
    } catch (error) {
      const conflict = classifyOrderDatabaseConflict(error);
      if (
        conflict === 'ORDER_IDEMPOTENCY' ||
        conflict === 'SERIALIZATION' ||
        conflict === 'DEADLOCK'
      ) {
        const replay = await this.findReplay(
          this.prisma,
          normalizedUserId,
          normalizedProductId,
          normalizedKey,
        );
        if (replay) {
          return replay;
        }
        throw concurrentModification();
      }
      if (conflict === 'ORDER_NUMBER') {
        throw concurrentModification();
      }
      throw error;
    }
  }

  async listForLearner(userId: string, query: ListOrdersDto) {
    const normalizedUserId = normalizeBoundedString(
      userId,
      '用户 ID',
      MAX_ID_LENGTH,
    );
    const { page, pageSize } = normalizePage(query);
    const where = { userId: normalizedUserId };
    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        select: learnerOrderSelection,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      data: orders.map(mapLearnerOrder),
      meta: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  async getForLearner(userId: string, orderId: string) {
    const normalizedUserId = normalizeBoundedString(
      userId,
      '用户 ID',
      MAX_ID_LENGTH,
    );
    const normalizedOrderId = normalizeBoundedString(
      orderId,
      '订单 ID',
      MAX_ID_LENGTH,
    );
    const order = await this.prisma.order.findFirst({
      where: {
        id: normalizedOrderId,
        userId: normalizedUserId,
      },
      select: learnerOrderSelection,
    });
    if (!order) {
      throw orderNotFound();
    }
    return mapLearnerOrder(order);
  }

  async listAdmin(query: ListAdminOrdersDto) {
    const { page, pageSize } = normalizePage(query);
    const orderNo = normalizeOptionalFilter(query.orderNo, '订单号', 100);
    const username = normalizeOptionalFilter(query.username, '用户名', 100);
    const createdFrom = normalizeDate(query.createdFrom, '开始日期');
    const createdTo = normalizeDate(query.createdTo, '结束日期');
    if (createdFrom && createdTo && createdFrom > createdTo) {
      throw validationFailed('开始日期不能晚于结束日期');
    }
    if (
      query.status !== undefined &&
      !Object.values(OrderStatus).includes(query.status)
    ) {
      throw validationFailed('订单状态无效');
    }
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(orderNo ? { orderNo } : {}),
      ...(username ? { user: { username } } : {}),
      ...(createdFrom || createdTo
        ? {
            createdAt: {
              ...(createdFrom ? { gte: createdFrom } : {}),
              ...(createdTo ? { lte: createdTo } : {}),
            },
          }
        : {}),
    } satisfies Prisma.OrderWhereInput;
    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        select: adminOrderSelection,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      data: orders.map(mapAdminOrder),
      meta: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  async getForAdmin(orderId: string) {
    const normalizedOrderId = normalizeBoundedString(
      orderId,
      '订单 ID',
      MAX_ID_LENGTH,
    );
    const order = await this.prisma.order.findUnique({
      where: { id: normalizedOrderId },
      select: adminOrderSelection,
    });
    if (!order) {
      throw orderNotFound();
    }
    return mapAdminOrder(order);
  }

  async complete(orderId: string, updatedBy: string) {
    const normalizedOrderId = normalizeBoundedString(
      orderId,
      '订单 ID',
      MAX_ID_LENGTH,
    );
    const normalizedUpdater = normalizeBoundedString(
      updatedBy,
      '管理员 ID',
      MAX_ID_LENGTH,
    );
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const completedAt = new Date();
          const orders = await tx.order.updateManyAndReturn({
            where: {
              id: normalizedOrderId,
              status: 'PENDING_PICKUP',
            },
            data: {
              status: 'COMPLETED',
              completedAt,
              cancelledAt: null,
              updatedBy: normalizedUpdater,
            },
            select: { id: true },
            limit: 1,
          });
          if (orders.length !== 1) {
            await this.throwCurrentOrderState(tx, normalizedOrderId);
          }
          const order = await tx.order.findUnique({
            where: { id: normalizedOrderId },
            select: adminOrderSelection,
          });
          if (!order) {
            throw orderNotFound();
          }
          return mapAdminOrder(order);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 10_000,
        },
      );
    } catch (error) {
      const conflict = classifyOrderDatabaseConflict(error);
      if (conflict === 'SERIALIZATION' || conflict === 'DEADLOCK') {
        await this.throwCurrentOrderState(this.prisma, normalizedOrderId);
        throw concurrentModification();
      }
      throw error;
    }
  }

  async cancel(orderId: string, updatedBy: string) {
    const normalizedOrderId = normalizeBoundedString(
      orderId,
      '订单 ID',
      MAX_ID_LENGTH,
    );
    const normalizedUpdater = normalizeBoundedString(
      updatedBy,
      '管理员 ID',
      MAX_ID_LENGTH,
    );
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const cancelledAt = new Date();
          const orders = await tx.order.updateManyAndReturn({
            where: {
              id: normalizedOrderId,
              status: 'PENDING_PICKUP',
            },
            data: {
              status: 'CANCELLED',
              completedAt: null,
              cancelledAt,
              updatedBy: normalizedUpdater,
            },
            select: {
              id: true,
              userId: true,
              productId: true,
              pointsCostSnapshot: true,
            },
            limit: 1,
          });
          const orderToRefund = orders[0];
          if (orders.length !== 1 || !orderToRefund) {
            await this.throwCurrentOrderState(tx, normalizedOrderId);
          }

          const products = await tx.product.updateMany({
            where: {
              id: orderToRefund.productId,
              stock: { lt: MAX_DATABASE_INTEGER },
            },
            data: { stock: { increment: 1 } },
          });
          if (products.count !== 1) {
            throw concurrentModification();
          }
          const balanceAfter = await this.pointsService.refundForOrder(
            tx,
            orderToRefund.userId,
            orderToRefund.pointsCostSnapshot,
          );
          if (balanceAfter === null) {
            throw concurrentModification();
          }
          await tx.pointLedger.create({
            data: {
              userId: orderToRefund.userId,
              type: 'ORDER_REFUND',
              delta: orderToRefund.pointsCostSnapshot,
              balanceAfter,
              orderId: orderToRefund.id,
            },
          });
          const order = await tx.order.findUnique({
            where: { id: normalizedOrderId },
            select: adminOrderSelection,
          });
          if (!order) {
            throw orderNotFound();
          }
          return mapAdminOrder(order);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 10_000,
        },
      );
    } catch (error) {
      const conflict = classifyOrderDatabaseConflict(error);
      if (
        conflict === 'SERIALIZATION' ||
        conflict === 'DEADLOCK' ||
        conflict === 'REFUND_LEDGER'
      ) {
        await this.throwCurrentOrderState(this.prisma, normalizedOrderId);
        throw concurrentModification();
      }
      throw error;
    }
  }

  private async findReplay(
    client: OrderClient,
    userId: string,
    productId: string,
    idempotencyKey: string,
  ) {
    const order = await client.order.findUnique({
      where: {
        userId_idempotencyKey: {
          userId,
          idempotencyKey,
        },
      },
      select: learnerOrderSelection,
    });
    if (!order) {
      return null;
    }
    if (order.productId !== productId) {
      throw idempotencyConflict();
    }
    return mapLearnerOrder(order);
  }

  private async throwCurrentOrderState(
    client: OrderClient,
    orderId: string,
  ): Promise<never> {
    const order = await client.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    if (!order) {
      throw orderNotFound();
    }
    if (order.status !== 'PENDING_PICKUP') {
      throw orderInvalidStatus(order.status);
    }
    throw concurrentModification();
  }
}
