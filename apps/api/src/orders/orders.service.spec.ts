import { BadRequestException } from '@nestjs/common';
import { generateOrderNumber } from './order-number';
import {
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
});
