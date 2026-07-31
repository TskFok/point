import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PointConfigClient = PrismaService | Prisma.TransactionClient;
type PointAssetClient = Prisma.TransactionClient;

const POSTGRES_INTEGER_MAX = 2_147_483_647;

const configSelection = {
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
} satisfies Prisma.PointConfigSelect;

@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentMultiplier(tx?: PointConfigClient): Promise<number> {
    const config = await (tx ?? this.prisma).pointConfig.findFirst({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { multiplier: true },
    });
    return config?.multiplier ?? 1;
  }

  async getCurrentConfig() {
    const config = await this.prisma.pointConfig.findFirst({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: configSelection,
    });
    return (
      config ?? {
        multiplier: 1,
        id: null,
        updatedBy: null,
        createdAt: null,
        updater: null,
      }
    );
  }

  async listConfigHistory(page: number, pageSize: number) {
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 100_000 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '倍率历史分页参数无效',
      });
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.pointConfig.findMany({
        select: configSelection,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.pointConfig.count(),
    ]);
    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  async getBalance(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { pointsBalance: true },
    });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: '用户不存在',
      });
    }
    return { balance: user.pointsBalance };
  }

  async listLedger(userId: string, page: number, pageSize: number) {
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 100_000 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '积分流水分页参数无效',
      });
    }
    const where = { userId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.pointLedger.findMany({
        where,
        select: {
          id: true,
          userId: true,
          type: true,
          delta: true,
          balanceAfter: true,
          answerAttemptId: true,
          orderId: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.pointLedger.count({ where }),
    ]);
    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  async debitForOrder(
    tx: PointAssetClient,
    userId: string,
    points: number,
  ): Promise<number | null> {
    if (!Number.isInteger(points) || points <= 0) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '订单扣减积分必须是正整数',
      });
    }
    const users = await tx.user.updateManyAndReturn({
      where: {
        id: userId,
        pointsBalance: { gte: points },
      },
      data: { pointsBalance: { decrement: points } },
      select: { pointsBalance: true },
      limit: 1,
    });
    return users.length === 1 ? users[0].pointsBalance : null;
  }

  async refundForOrder(
    tx: PointAssetClient,
    userId: string,
    points: number,
  ): Promise<number | null> {
    if (!Number.isInteger(points) || points <= 0) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '订单退款积分必须是正整数',
      });
    }
    const users = await tx.user.updateManyAndReturn({
      where: {
        id: userId,
        pointsBalance: { lte: POSTGRES_INTEGER_MAX - points },
      },
      data: { pointsBalance: { increment: points } },
      select: { pointsBalance: true },
      limit: 1,
    });
    return users.length === 1 ? users[0].pointsBalance : null;
  }

  updateMultiplier(multiplier: number, updatedBy: string) {
    if (!Number.isInteger(multiplier) || multiplier < 1 || multiplier > 10) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '积分倍率必须是 1–10 的整数',
      });
    }
    return this.prisma.pointConfig.create({
      data: {
        multiplier,
        updatedBy,
      },
      select: configSelection,
    });
  }
}
