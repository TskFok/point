import { BadRequestException } from '@nestjs/common';
import { generateOrderNumber } from './order-number';
import {
  classifyOrderDatabaseConflict,
  isOrderIdempotencyUniqueConflict,
  OrdersService,
} from './orders.service';

describe('订单领域服务', () => {
  it('订单号具有固定格式与足够随机空间', () => {
    const values = Array.from({ length: 100 }, () => generateOrderNumber());
    expect(new Set(values).size).toBe(values.length);
    expect(values.every((value) => /^PQ-[A-Z0-9]{26}$/.test(value))).toBe(true);
  });

  it('仅精确识别订单用户与幂等键唯一冲突', () => {
    const exactConflict = {
      code: 'P2002',
      meta: {
        modelName: 'Order',
        target: ['userId', 'idempotencyKey'],
      },
    };
    expect(isOrderIdempotencyUniqueConflict(exactConflict)).toBe(true);
    expect(
      isOrderIdempotencyUniqueConflict({
        ...exactConflict,
        meta: {
          modelName: 'Order',
          target: ['id', 'userId', 'idempotencyKey'],
        },
      }),
    ).toBe(false);
    expect(
      isOrderIdempotencyUniqueConflict({
        ...exactConflict,
        meta: {
          modelName: 'AnswerAttempt',
          target: ['userId', 'idempotencyKey'],
        },
      }),
    ).toBe(false);
    expect(
      isOrderIdempotencyUniqueConflict({
        ...exactConflict,
        meta: {
          modelName: 'Order',
          target: 'Order_userId_idempotencyKey_key_suffix',
        },
      }),
    ).toBe(false);
  });

  it.each([
    [
      '订单幂等唯一约束',
      {
        code: 'P2002',
        meta: {
          modelName: 'Order',
          target: ['userId', 'idempotencyKey'],
        },
      },
      'ORDER_IDEMPOTENCY',
    ],
    [
      '订单号唯一约束',
      {
        code: 'P2002',
        meta: {
          modelName: 'Order',
          target: 'Order_orderNo_key',
        },
      },
      'ORDER_NUMBER',
    ],
    [
      '退款流水唯一约束',
      {
        code: 'P2002',
        meta: {
          modelName: 'PointLedger',
          driverAdapterError: {
            cause: {
              constraint: {
                fields: ['orderId', 'type'],
              },
            },
          },
        },
      },
      'REFUND_LEDGER',
    ],
    ['Prisma 事务写冲突', { code: 'P2034' }, 'SERIALIZATION'],
    [
      'PostgreSQL 序列化冲突',
      {
        code: 'P2010',
        meta: {
          driverAdapterError: {
            cause: {
              kind: 'TransactionWriteConflict',
              originalCode: '40001',
            },
          },
        },
      },
      'SERIALIZATION',
    ],
    [
      'PostgreSQL 死锁',
      {
        code: 'P2010',
        meta: {
          driverAdapterError: {
            cause: {
              originalCode: '40P01',
            },
          },
        },
      },
      'DEADLOCK',
    ],
  ] as const)('精确分类%s', (_name, error, expected) => {
    expect(classifyOrderDatabaseConflict(error)).toBe(expected);
  });

  it.each([
    { code: 'P20340' },
    {
      code: 'P2010',
      meta: {
        driverAdapterError: {
          cause: {
            kind: 'TransactionWriteConflict',
            originalCode: '400010',
          },
        },
      },
    },
    {
      code: 'P2010',
      meta: {
        driverAdapterError: {
          cause: {
            originalCode: 'X40P01',
          },
        },
      },
    },
    {
      code: 'P2002',
      meta: {
        modelName: 'Order',
        target: 'Order_orderNo_key_suffix',
      },
    },
    {
      code: 'P2002',
      meta: {
        modelName: 'PointLedger',
        target: ['id', 'orderId', 'type'],
      },
    },
  ])('近似数据库错误不被宽泛误分类 %#', (error) => {
    expect(classifyOrderDatabaseConflict(error)).toBeNull();
  });

  it.each([
    { page: 0, pageSize: 20 },
    { page: 1, pageSize: 101 },
    {
      page: 1,
      pageSize: 20,
      createdFrom: '2026-07-31T00:00:00.000Z',
      createdTo: '2026-07-30T00:00:00.000Z',
    },
  ])('服务层拒绝绕过 DTO 的非法筛选 %#', async (query) => {
    const service = new OrdersService({} as never, {} as never);
    await expect(service.listAdmin(query as never)).rejects.toMatchObject({
      constructor: BadRequestException,
    });
  });

  it.each(['2026-07-15', '2026-07-15T08:30:00'])(
    '服务层拒绝不带时区的非完整时间点 %s',
    async (createdFrom) => {
      const service = new OrdersService({} as never, {} as never);
      await expect(
        service.listAdmin({
          page: 1,
          pageSize: 20,
          createdFrom,
        }),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
      });
    },
  );
});
