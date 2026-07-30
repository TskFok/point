import { BadRequestException, Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PointConfigClient = PrismaService | Prisma.TransactionClient;

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
