import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type AiModelConfig, type Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { type CreateAiModelDto } from './dto/create-ai-model.dto';
import { type ListAiModelsDto } from './dto/list-ai-models.dto';
import { type UpdateAiModelDto } from './dto/update-ai-model.dto';
import {
  encryptSecret,
  decryptSecret,
  maskApiKey,
  resolveEncryptionKey,
} from './secret-crypto';
import {
  probeOpenAiCompatibleModels,
  type ProbeResult,
} from './probe-openai-compatible';

export type AiModelConfigView = {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyMasked: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

function validationFailed(message: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    message,
  });
}

function aiModelNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'AI_MODEL_NOT_FOUND',
    message: 'AI 模型配置不存在',
  });
}

function nameConflict(): ConflictException {
  return new ConflictException({
    code: 'AI_MODEL_NAME_CONFLICT',
    message: '模型名称已存在',
  });
}

function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
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

function normalizeBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw validationFailed(`${fieldName}必须是布尔值`);
  }
  return value;
}

export function assertHttpUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw validationFailed('调用地址必须是合法 URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw validationFailed('调用地址必须是 http 或 https');
  }
  return value.replace(/\/+$/, '');
}

function toDto(row: AiModelConfig): AiModelConfigView {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    apiKeyMasked: maskApiKey(row.apiKeyLast4),
    isEnabled: row.isEnabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class AiModelsService {
  constructor(private readonly prisma: PrismaService) {}

  private encryptionKey(): Buffer {
    try {
      return resolveEncryptionKey();
    } catch {
      throw validationFailed('AI_CONFIG_ENCRYPTION_KEY 未配置或无效');
    }
  }

  async list(query: ListAiModelsDto) {
    if (
      !Number.isInteger(query.page) ||
      query.page < 1 ||
      query.page > 1_000_000 ||
      !Number.isInteger(query.pageSize) ||
      query.pageSize < 1 ||
      query.pageSize > 100
    ) {
      throw validationFailed('分页参数超出允许范围');
    }
    const where: Prisma.AiModelConfigWhereInput =
      query.isEnabled === undefined ? {} : { isEnabled: query.isEnabled };
    const skip = (query.page - 1) * query.pageSize;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.aiModelConfig.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.aiModelConfig.count({ where }),
    ]);
    return {
      data: data.map(toDto),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async get(id: string): Promise<AiModelConfigView> {
    const row = await this.requireRow(id);
    return toDto(row);
  }

  async create(
    input: CreateAiModelDto,
    userId: string,
  ): Promise<AiModelConfigView> {
    const name = normalizeText(input.name, '模型名称', 100);
    const baseUrl = assertHttpUrl(
      normalizeText(input.baseUrl, '调用地址', 500),
    );
    const apiKey = normalizeText(input.apiKey, 'API Key', 2000);
    const isEnabled =
      input.isEnabled === undefined
        ? true
        : normalizeBoolean(input.isEnabled, '启用状态');
    const { ciphertext, last4 } = encryptSecret(apiKey, this.encryptionKey());
    try {
      const row = await this.prisma.aiModelConfig.create({
        data: {
          name,
          baseUrl,
          apiKeyCiphertext: ciphertext,
          apiKeyLast4: last4,
          isEnabled,
          updatedBy: userId,
        },
      });
      return toDto(row);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw nameConflict();
      }
      throw error;
    }
  }

  async update(
    id: string,
    input: UpdateAiModelDto,
    userId: string,
  ): Promise<AiModelConfigView> {
    const data: Prisma.AiModelConfigUpdateInput = {
      updater: { connect: { id: userId } },
    };
    let touched = false;

    if (input.name !== undefined) {
      data.name = normalizeText(input.name, '模型名称', 100);
      touched = true;
    }
    if (input.baseUrl !== undefined) {
      data.baseUrl = assertHttpUrl(
        normalizeText(input.baseUrl, '调用地址', 500),
      );
      touched = true;
    }
    if (input.isEnabled !== undefined) {
      data.isEnabled = normalizeBoolean(input.isEnabled, '启用状态');
      touched = true;
    }
    if (input.apiKey !== undefined && input.apiKey.trim() !== '') {
      const encrypted = encryptSecret(
        normalizeText(input.apiKey, 'API Key', 2000),
        this.encryptionKey(),
      );
      data.apiKeyCiphertext = encrypted.ciphertext;
      data.apiKeyLast4 = encrypted.last4;
      touched = true;
    }

    if (!touched) {
      throw validationFailed('至少需要提供一个待更新字段');
    }

    try {
      await this.requireRow(id);
      const row = await this.prisma.aiModelConfig.update({
        where: { id },
        data,
      });
      return toDto(row);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw nameConflict();
      }
      throw error;
    }
  }

  async remove(id: string): Promise<{ success: true }> {
    await this.requireRow(id);
    try {
      await this.prisma.aiModelConfig.delete({ where: { id } });
    } catch (error) {
      if (isPrismaError(error, 'P2003')) {
        throw new ConflictException({
          code: 'AI_MODEL_IN_USE',
          message: '该模型仍被 AI 任务引用，请先改绑或删除任务',
        });
      }
      throw error;
    }
    return { success: true };
  }

  async requireRow(id: string): Promise<AiModelConfig> {
    const row = await this.prisma.aiModelConfig.findUnique({ where: { id } });
    if (!row) {
      throw aiModelNotFound();
    }
    return row;
  }

  async testById(id: string): Promise<ProbeResult> {
    const row = await this.requireRow(id);
    const apiKey = decryptSecret(row.apiKeyCiphertext, this.encryptionKey());
    return probeOpenAiCompatibleModels(row.baseUrl, apiKey);
  }

  async testDraft(input: {
    baseUrl: string;
    apiKey?: string;
    id?: string;
  }): Promise<ProbeResult> {
    const baseUrl = assertHttpUrl(
      normalizeText(input.baseUrl, '调用地址', 500),
    );
    let apiKey = input.apiKey?.trim() ?? '';
    if (!apiKey) {
      if (!input.id) {
        throw validationFailed('测试连通需要 API Key 或已保存配置 id');
      }
      const row = await this.requireRow(input.id);
      apiKey = decryptSecret(row.apiKeyCiphertext, this.encryptionKey());
    }
    return probeOpenAiCompatibleModels(baseUrl, apiKey);
  }
}
