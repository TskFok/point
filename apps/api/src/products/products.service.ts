import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  type CreateProductDto,
  POSTGRES_INTEGER_MAX,
  PRODUCT_IMAGE_KEY_PATTERN,
} from './dto/create-product.dto';
import { type ListProductsDto } from './dto/list-products.dto';
import { type UpdateProductDto } from './dto/update-product.dto';

type NormalizedProductWrite = {
  name: string;
  description: string;
  imageKey: string;
  stock: number;
  pointsCost: number;
  isActive: boolean;
};

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

function productActiveConflict(): ConflictException {
  return new ConflictException({
    code: 'PRODUCT_ACTIVE',
    message: '请先下架再删除',
  });
}

function productHasOrdersConflict(): ConflictException {
  return new ConflictException({
    code: 'PRODUCT_HAS_ORDERS',
    message: '该商品已有订单，无法删除',
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeText(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== 'string') {
    throw validationFailed(`${fieldName}必须是字符串`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw validationFailed(`${fieldName}不能为空`);
  }
  if (Array.from(normalized).length > maxLength) {
    throw validationFailed(`${fieldName}不能超过 ${maxLength} 个字符`);
  }
  return normalized;
}

function normalizeInteger(value: unknown, fieldName: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > POSTGRES_INTEGER_MAX
  ) {
    throw validationFailed(
      `${fieldName}必须是 0–${POSTGRES_INTEGER_MAX} 的整数`,
    );
  }
  return value;
}

function normalizeBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw validationFailed(`${fieldName}必须是布尔值`);
  }
  return value;
}

function normalizeImageKey(value: unknown): string {
  const key = normalizeText(value, '商品图片 key', 200);
  if (!PRODUCT_IMAGE_KEY_PATTERN.test(key)) {
    throw validationFailed('商品图片 key 不受信任');
  }
  return key;
}

function normalizeProductWrite(value: unknown): NormalizedProductWrite {
  if (!isRecord(value)) {
    throw validationFailed('商品写入参数必须是对象');
  }
  const normalized = {
    name: normalizeText(value.name, '商品名称', 200),
    description: normalizeText(value.description, '商品描述', 5000),
    imageKey: normalizeImageKey(value.imageKey),
    stock: normalizeInteger(value.stock, '库存'),
    pointsCost: normalizeInteger(value.pointsCost, '兑换积分'),
    isActive:
      value.isActive === undefined
        ? true
        : normalizeBoolean(value.isActive, '上架状态'),
  };
  if (normalized.isActive && normalized.pointsCost === 0) {
    throw validationFailed('已上架商品的兑换积分必须大于 0');
  }
  return normalized;
}

function normalizeUpdateInput(
  value: unknown,
): Partial<Record<keyof NormalizedProductWrite, unknown>> {
  if (!isRecord(value)) {
    throw validationFailed('商品更新参数必须是对象');
  }
  const allowedFields = [
    'name',
    'description',
    'imageKey',
    'stock',
    'pointsCost',
    'isActive',
  ] as const;
  const input: Partial<Record<keyof NormalizedProductWrite, unknown>> = {};
  for (const field of allowedFields) {
    if (value[field] !== undefined) {
      input[field] = value[field];
    }
  }
  if (Object.keys(input).length === 0) {
    throw validationFailed('至少需要提供一个待更新字段');
  }
  return input;
}

function productWhere(
  query: ListProductsDto,
  learnerOnly: boolean,
): Prisma.ProductWhereInput {
  return {
    ...(learnerOnly
      ? { isActive: true }
      : query.isActive === undefined
        ? {}
        : { isActive: query.isActive }),
    ...(query.search
      ? {
          OR: [
            {
              name: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
            },
            {
              description: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
            },
          ],
        }
      : {}),
  };
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateProductDto) {
    return this.prisma.product.create({
      data: normalizeProductWrite(data),
    });
  }

  async list(query: ListProductsDto, learnerOnly = false) {
    if (
      !Number.isInteger(query.page) ||
      query.page < 1 ||
      query.page > 1_000_000 ||
      !Number.isInteger(query.pageSize) ||
      query.pageSize < 1 ||
      query.pageSize > 100
    ) {
      throw validationFailed('商品分页参数超出允许范围');
    }
    const where = productWhere(query, learnerOnly);
    const skip = (query.page - 1) * query.pageSize;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async getForLearner(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        isActive: true,
      },
    });
    if (!product) {
      throw productNotFound();
    }
    return product;
  }

  async update(productId: string, data: UpdateProductDto) {
    const input = normalizeUpdateInput(data);
    return this.prisma.$transaction(async (tx) => {
      const lockedProducts = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Product"
        WHERE "id" = ${productId}
        FOR UPDATE
      `;
      if (lockedProducts.length === 0) {
        throw productNotFound();
      }
      const existing = await tx.product.findUnique({
        where: { id: productId },
      });
      if (!existing) {
        throw productNotFound();
      }
      const normalized = normalizeProductWrite({
        ...existing,
        ...input,
      });
      const updateData: Partial<NormalizedProductWrite> = {};
      for (const field of Object.keys(input) as Array<
        keyof NormalizedProductWrite
      >) {
        updateData[field] = normalized[field] as never;
      }
      return tx.product.update({
        where: { id: productId },
        data: updateData,
      });
    });
  }

  async remove(productId: string): Promise<{ success: true }> {
    const existing = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!existing) {
      throw productNotFound();
    }
    if (existing.isActive) {
      throw productActiveConflict();
    }
    const orderCount = await this.prisma.order.count({
      where: { productId },
    });
    if (orderCount > 0) {
      throw productHasOrdersConflict();
    }
    await this.prisma.product.delete({ where: { id: productId } });
    return { success: true };
  }
}
