import { BadRequestException } from '@nestjs/common';
import { PointsService } from './points.service';

describe('PointsService 管理端倍率历史', () => {
  it('按 createdAt 与 id 倒序分页返回配置历史', async () => {
    const rows = [
      {
        id: 'point-config-2',
        multiplier: 3,
        updatedBy: 'admin-1',
        createdAt: new Date('2026-07-31T08:00:00.000Z'),
        updater: { id: 'admin-1', username: 'admin' },
      },
    ];
    const findMany = jest.fn().mockReturnValue(Promise.resolve(rows));
    const count = jest.fn().mockReturnValue(Promise.resolve(3));
    const transaction = jest.fn().mockResolvedValue([rows, 3]);
    const service = new PointsService({
      pointConfig: { findMany, count },
      $transaction: transaction,
    } as never);

    await expect(service.listConfigHistory(2, 1)).resolves.toEqual({
      data: rows,
      meta: {
        page: 2,
        pageSize: 1,
        total: 3,
        totalPages: 3,
      },
    });
    expect(findMany).toHaveBeenCalledWith({
      select: {
        id: true,
        multiplier: true,
        updatedBy: true,
        createdAt: true,
        updater: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 1,
      take: 1,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    [0, 20],
    [1.2, 20],
    [1, 0],
    [1, 101],
  ])('拒绝无效分页 page=%s pageSize=%s', async (page, pageSize) => {
    const service = new PointsService({} as never);

    await expect(service.listConfigHistory(page, pageSize)).rejects.toThrow(
      BadRequestException,
    );
  });
});
