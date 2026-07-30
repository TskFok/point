import { applyDecorators, type Type } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiExtraModels,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  type ApiBodyOptions,
  type ApiParamOptions,
  type ApiQueryOptions,
  type ApiResponseOptions,
} from '@nestjs/swagger';
import { ApiErrorDto } from './api-contract.models';

export type ApiContractOptions = {
  operationId: string;
  summary: string;
  description?: string;
  responseType?: Type<unknown>;
  response?: ApiResponseOptions;
  responseStatus?: number;
  authenticated?: boolean;
  mutation?: boolean;
  csrf?: boolean;
  csrfDescription?: string;
  optionalRefreshCookie?: boolean;
  bodyType?: Type<unknown>;
  body?: ApiBodyOptions;
  idempotent?: boolean;
  multipart?: boolean;
  params?: ApiParamOptions[];
  queries?: ApiQueryOptions[];
  extraModels?: Type<unknown>[];
};

const ERROR_RESPONSES = [
  { status: 400, description: '请求参数验证失败' },
  { status: 401, description: '身份认证失败' },
  { status: 403, description: '权限不足或 CSRF 校验失败' },
  { status: 404, description: '资源不存在' },
  { status: 409, description: '状态、幂等或并发冲突' },
  { status: 413, description: '请求体或上传文件过大' },
  { status: 500, description: '服务器内部错误' },
] as const;

export function ApiContract(options: ApiContractOptions): MethodDecorator {
  const decorators = [
    ApiOperation({
      operationId: options.operationId,
      summary: options.summary,
      description: options.description,
    }),
    ApiResponse({
      status: options.responseStatus ?? 200,
      description: '成功',
      ...(options.response ?? { type: options.responseType }),
    }),
    ...ERROR_RESPONSES.map(({ status, description }) =>
      ApiResponse({ status, description, type: ApiErrorDto }),
    ),
  ];

  if (options.extraModels?.length) {
    decorators.push(ApiExtraModels(...options.extraModels));
  }
  if (options.authenticated) {
    decorators.push(ApiBearerAuth('bearerAuth'), ApiCookieAuth('cookieAuth'));
  }
  if (options.optionalRefreshCookie) {
    decorators.push(ApiSecurity('refreshCookieAuth'), ApiSecurity({}));
  }
  if ((options.authenticated && options.mutation) || options.csrf) {
    decorators.push(
      ApiHeader({
        name: 'X-CSRF-Token',
        required: false,
        description:
          options.csrfDescription ??
          '使用 Cookie 身份认证执行写操作时必填；Bearer 模式勿填',
        schema: { type: 'string', minLength: 1 },
      }),
    );
  }
  if (options.idempotent) {
    decorators.push(
      ApiHeader({
        name: 'Idempotency-Key',
        required: true,
        description: '同一用户内唯一，重试同一请求时必须复用',
        schema: { type: 'string', minLength: 1, maxLength: 128 },
      }),
    );
  }
  if (options.multipart) {
    decorators.push(ApiConsumes('multipart/form-data'));
  }
  if (options.bodyType) {
    decorators.push(ApiBody({ type: options.bodyType }));
  } else if (options.body) {
    decorators.push(ApiBody(options.body));
  }
  for (const param of options.params ?? []) {
    decorators.push(ApiParam(param));
  }
  for (const query of options.queries ?? []) {
    decorators.push(ApiQuery(query));
  }
  return applyDecorators(...decorators);
}

export const pageQueries: ApiQueryOptions[] = [
  {
    name: 'page',
    required: false,
    schema: {
      type: 'integer',
      format: 'int32',
      minimum: 1,
      maximum: 100_000,
      default: 1,
    },
  },
  {
    name: 'pageSize',
    required: false,
    schema: {
      type: 'integer',
      format: 'int32',
      minimum: 1,
      maximum: 100,
      default: 20,
    },
  },
];

export const productQueries: ApiQueryOptions[] = [
  {
    name: 'search',
    required: false,
    schema: { type: 'string', maxLength: 200 },
  },
  {
    name: 'isActive',
    required: false,
    schema: { type: 'boolean' },
  },
  {
    name: 'page',
    required: false,
    schema: {
      type: 'integer',
      format: 'int32',
      minimum: 1,
      maximum: 1_000_000,
      default: 1,
    },
  },
  pageQueries[1],
];

export const questionQueries: ApiQueryOptions[] = [
  {
    name: 'search',
    required: false,
    schema: { type: 'string', maxLength: 200 },
  },
  {
    name: 'isActive',
    required: false,
    schema: { type: 'boolean' },
  },
  ...pageQueries,
];

export const adminOrderQueries: ApiQueryOptions[] = [
  ...pageQueries,
  {
    name: 'status',
    required: false,
    schema: {
      type: 'string',
      enum: ['PENDING_PICKUP', 'COMPLETED', 'CANCELLED'],
    },
  },
  {
    name: 'orderNo',
    required: false,
    schema: { type: 'string', minLength: 1, maxLength: 100 },
  },
  {
    name: 'username',
    required: false,
    schema: { type: 'string', minLength: 1, maxLength: 100 },
  },
  {
    name: 'createdFrom',
    required: false,
    schema: { type: 'string', format: 'date-time' },
  },
  {
    name: 'createdTo',
    required: false,
    schema: { type: 'string', format: 'date-time' },
  },
];

export const questionIdParam: ApiParamOptions = {
  name: 'questionId',
  schema: { type: 'string', minLength: 1, maxLength: 191 },
};

export const productIdParam: ApiParamOptions = {
  name: 'productId',
  schema: { type: 'string', minLength: 1, maxLength: 191 },
};

export const orderIdParam: ApiParamOptions = {
  name: 'orderId',
  schema: { type: 'string', minLength: 1, maxLength: 191 },
};
