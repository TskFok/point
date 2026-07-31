import { NestFactory } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from '../app.module';
import { configureApiApp } from '../common/http/configure-api-app';
import { createOpenApiDocument } from './create-openapi-document';

type HttpMethod =
  'get' | 'put' | 'post' | 'delete' | 'options' | 'head' | 'patch' | 'trace';

type ReferenceObject = { $ref: string };
type SchemaObject = {
  type?: string;
  format?: string;
  pattern?: string;
  minProperties?: number;
  additionalProperties?: boolean;
  oneOf?: ReferenceObject[];
  properties?: Record<string, unknown>;
  required?: string[];
};
type ParameterObject = {
  description?: string;
  in: string;
  name: string;
  required?: boolean;
};
type RequestBodyObject = {
  required?: boolean;
  content: Record<string, { schema?: unknown }>;
};
type ResponseObject = {
  content?: Record<string, { schema?: unknown }>;
  headers?: Record<string, { description?: string; schema?: unknown }>;
};
type OperationObject = {
  description?: string;
  operationId?: string;
  parameters?: Array<ParameterObject | ReferenceObject>;
  requestBody?: RequestBodyObject | ReferenceObject;
  responses: Record<string, ResponseObject | ReferenceObject>;
  security?: Array<Record<string, string[]>>;
};
type PathItemObject = Partial<Record<HttpMethod, OperationObject>>;

const methods: HttpMethod[] = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
];

function operations(document: OpenAPIObject): OperationObject[] {
  return Object.values(document.paths).flatMap((path) =>
    methods.flatMap((method) => {
      const operation = (path as PathItemObject | undefined)?.[method];
      return operation ? [operation] : [];
    }),
  );
}

function isReference(value: unknown): value is ReferenceObject {
  return typeof value === 'object' && value !== null && '$ref' in value;
}

function responseSchema(response: ResponseObject | ReferenceObject) {
  if (isReference(response)) {
    return response;
  }
  return response.content?.['application/json']?.schema;
}

function matchingNamedObjectSchemas(
  document: OpenAPIObject,
  branches: ReferenceObject[],
  value: Record<string, unknown>,
): string[] {
  return branches.flatMap((branch) => {
    const name = branch.$ref.split('/').at(-1)!;
    const schema = document.components?.schemas?.[name];
    if (!schema || isReference(schema) || schema.type !== 'object') {
      return [];
    }
    const required = schema.required ?? [];
    if (required.some((property) => !(property in value))) {
      return [];
    }
    if (
      schema.additionalProperties === false &&
      Object.keys(value).some(
        (property) => !Object.hasOwn(schema.properties ?? {}, property),
      )
    ) {
      return [];
    }
    return [name];
  });
}

describe('OpenAPI 契约', () => {
  let document: OpenAPIObject;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const app = await NestFactory.create(AppModule, { logger: false });
    configureApiApp(app, 'http://localhost:3001');
    document = createOpenApiDocument(app);
    close = () => app.close();
  });

  afterAll(async () => close());

  it('完整覆盖 30 个路径下 35 个稳定 operationId 的版本化路由', () => {
    const allOperations = operations(document);
    const operationIds = allOperations.map(
      (operation) => operation.operationId,
    );

    expect(Object.keys(document.paths)).toHaveLength(30);
    expect(allOperations).toHaveLength(35);
    expect(new Set(operationIds).size).toBe(35);
    expect(operationIds).not.toContain(undefined);
    expect(
      Object.keys(document.paths).every((path) => path.startsWith('/api/v1/')),
    ).toBe(true);
  });

  it('声明管理员概览与倍率历史的响应和分页契约', () => {
    expect(document.paths['/api/v1/admin/dashboard']?.get).toMatchObject({
      operationId: 'adminGetDashboard',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdminDashboardDto' },
            },
          },
        },
      },
    });
    const historyOperation = document.paths[
      '/api/v1/admin/points/config/history'
    ]?.get as OperationObject | undefined;
    expect(historyOperation).toBeDefined();
    if (!historyOperation) {
      throw new Error('缺少管理员积分倍率历史接口');
    }

    expect(historyOperation.operationId).toBe('adminListPointConfigHistory');
    const historyParameters = historyOperation.parameters?.flatMap(
      (parameter) => {
        if (
          isReference(parameter) ||
          parameter.in !== 'query' ||
          !['page', 'pageSize'].includes(parameter.name)
        ) {
          return [];
        }

        return [{ name: parameter.name, required: parameter.required }];
      },
    );
    expect(historyParameters).toEqual([
      { name: 'page', required: false },
      { name: 'pageSize', required: false },
    ]);

    const historyResponse = historyOperation.responses['200'];
    expect(historyResponse).toBeDefined();
    if (!historyResponse) {
      throw new Error('积分倍率历史接口缺少 200 响应');
    }

    expect(responseSchema(historyResponse)).toEqual({
      $ref: '#/components/schemas/PointConfigListResponseDto',
    });
  });

  it('题目管理响应公开已有答题记录只读标志', () => {
    const schema = document.components?.schemas
      ?.AdminQuestionDto as SchemaObject;

    expect(schema.properties?.hasAttempts).toEqual({ type: 'boolean' });
    expect(schema.required).toContain('hasAttempts');
  });

  it('每个成功响应和统一错误响应都有非空 schema', () => {
    for (const operation of operations(document)) {
      const responses = operation.responses ?? {};
      const success = Object.entries(responses).find(([status]) =>
        /^2\d\d$/.test(status),
      )?.[1];
      expect(success).toBeDefined();
      expect(responseSchema(success!)).toBeDefined();
      expect(responseSchema(responses['400'])).toEqual({
        $ref: '#/components/schemas/ApiErrorDto',
      });
    }
    const apiError = document.components?.schemas?.ApiErrorDto as SchemaObject;
    expect(apiError.required).toEqual([
      'code',
      'message',
      'requestId',
      'details',
    ]);
  });

  it('声明 Bearer/Cookie 二选一安全方案、幂等键和上传契约', () => {
    expect(document.components?.securitySchemes).toMatchObject({
      bearerAuth: { type: 'http', scheme: 'bearer' },
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'pq_access' },
    });

    const createOrder = document.paths['/api/v1/orders']?.post;
    expect(createOrder?.security).toEqual([
      { bearerAuth: [] },
      { cookieAuth: [] },
    ]);
    const headers = createOrder?.parameters?.filter(
      (parameter: ParameterObject | ReferenceObject) =>
        !isReference(parameter) && parameter.in === 'header',
    );
    expect(headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Idempotency-Key', required: true }),
        expect.objectContaining({ name: 'X-CSRF-Token', required: false }),
      ]),
    );

    for (const operation of [
      document.paths['/api/v1/orders']?.post,
      document.paths['/api/v1/practice/questions/{questionId}/answer']?.post,
      document.paths['/api/v1/practice/wrong-questions/{questionId}/answer']
        ?.post,
    ]) {
      const idempotencyHeader = operation?.parameters?.find(
        (parameter) =>
          !isReference(parameter) &&
          parameter.in === 'header' &&
          parameter.name === 'Idempotency-Key',
      );
      expect(idempotencyHeader).toMatchObject({ required: true });
    }

    for (const path of ['/api/v1/auth/refresh', '/api/v1/auth/logout']) {
      const csrfHeader = document.paths[path]?.post?.parameters?.find(
        (parameter) =>
          !isReference(parameter) &&
          parameter.in === 'header' &&
          parameter.name === 'X-CSRF-Token',
      );
      expect(csrfHeader).toMatchObject({ required: false });
    }

    const upload = document.paths['/api/v1/admin/uploads/product-images']?.post;
    expect(upload?.requestBody).toMatchObject({
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            required: ['file'],
            properties: { file: { type: 'string', format: 'binary' } },
          },
        },
      },
    });
  });

  it('所有 JSON requestBody 均引用有字段的命名 schema', () => {
    for (const operation of operations(document)) {
      if (!operation.requestBody || isReference(operation.requestBody)) {
        continue;
      }
      const schema = operation.requestBody.content['application/json']?.schema;
      if (!schema) {
        continue;
      }
      expect(schema).toHaveProperty('$ref');
      const name = (schema as ReferenceObject).$ref.split('/').at(-1)!;
      const model = document.components?.schemas?.[name];
      expect(model).toBeDefined();
      expect(
        Object.keys((model as SchemaObject).properties ?? {}),
      ).not.toHaveLength(0);
    }
  });

  it('refresh 使用明确的 Web 与 Android 响应联合契约', () => {
    const response =
      document.paths['/api/v1/auth/refresh']?.post?.responses?.['201'];
    expect(
      responseSchema(response as unknown as ReferenceObject | ResponseObject),
    ).toEqual({
      oneOf: [
        { $ref: '#/components/schemas/WebSessionResponseDto' },
        { $ref: '#/components/schemas/TokenResponseDto' },
      ],
    });

    const token = document.components?.schemas
      ?.TokenResponseDto as SchemaObject;
    expect(token.required).toEqual(
      expect.arrayContaining([
        'accessToken',
        'refreshToken',
        'accessTokenExpiresIn',
        'refreshTokenExpiresAt',
      ]),
    );

    const branches = (
      responseSchema(
        response as unknown as ReferenceObject | ResponseObject,
      ) as SchemaObject
    ).oneOf!;
    const user = {
      id: 'user-1',
      username: 'student_01',
      role: 'STUDENT',
      pointsBalance: 10,
    };
    expect(matchingNamedObjectSchemas(document, branches, { user })).toEqual([
      'WebSessionResponseDto',
    ]);
    expect(
      matchingNamedObjectSchemas(document, branches, {
        user,
        accessToken: 'access-token',
        accessTokenExpiresIn: 900,
        refreshToken: 'refresh-token',
        refreshTokenExpiresAt: '2026-08-30T00:00:00.000Z',
      }),
    ).toEqual(['TokenResponseDto']);
  });

  it('refresh/logout 机器可读声明可选 pq_refresh Cookie 模式', () => {
    for (const path of ['/api/v1/auth/refresh', '/api/v1/auth/logout']) {
      expect(document.paths[path]?.post?.security).toEqual([
        { refreshCookieAuth: [] },
        {},
      ]);
    }
    expect(
      document.paths['/api/v1/auth/login']?.post?.security,
    ).toBeUndefined();
    expect(
      document.paths['/api/v1/auth/token']?.post?.security,
    ).toBeUndefined();
  });

  it('完整记录登录、刷新和登出的 Cookie 副作用与 refresh CSRF 模式', () => {
    expect(document.components?.securitySchemes).toMatchObject({
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'pq_access' },
      refreshCookieAuth: { type: 'apiKey', in: 'cookie', name: 'pq_refresh' },
    });

    const authOperations = [
      document.paths['/api/v1/auth/login']?.post,
      document.paths['/api/v1/auth/refresh']?.post,
      document.paths['/api/v1/auth/logout']?.post,
    ];
    const authDocumentation = JSON.stringify(authOperations);
    expect(authDocumentation).toContain('pq_access');
    expect(authDocumentation).toContain('pq_refresh');
    expect(authDocumentation).toContain('pq_csrf');
    expect(authDocumentation).toContain('HttpOnly');
    expect(authDocumentation).toContain('可由 JavaScript 读取');
    expect(authDocumentation).toContain('清除');
    expect(authDocumentation).toContain('刷新');

    for (const operation of authOperations.slice(1)) {
      const csrfHeader = operation?.parameters?.find(
        (parameter) =>
          !isReference(parameter) &&
          parameter.in === 'header' &&
          parameter.name === 'X-CSRF-Token',
      );
      expect(csrfHeader).toMatchObject({
        description:
          '使用 pq_refresh Cookie 刷新或注销时必填；body refreshToken 模式勿填',
      });
      expect(
        (csrfHeader as ParameterObject | undefined)?.description,
      ).not.toContain('Bearer');
    }
  });

  it('部分更新 body 至少有一个字段且商品 imageKey 复用可信格式', () => {
    const questionUpdate = document.components?.schemas
      ?.UpdateQuestionRequestDto as SchemaObject;
    const productUpdate = document.components?.schemas
      ?.UpdateProductRequestDto as SchemaObject;
    const productCreate = document.components?.schemas
      ?.CreateProductRequestDto as SchemaObject;

    expect(questionUpdate.minProperties).toBe(1);
    expect(productUpdate.minProperties).toBe(1);
    expect((productUpdate.properties?.imageKey as SchemaObject).pattern).toBe(
      (productCreate.properties?.imageKey as SchemaObject).pattern,
    );
  });

  it('所有领域整数都声明为 OpenAPI integer/int32', () => {
    const integerFields = new Set([
      'accessTokenExpiresIn',
      'activeTotal',
      'balance',
      'balanceAfter',
      'basePoints',
      'delta',
      'errorCount',
      'firstAnsweredCount',
      'masteredWrongCount',
      'multiplier',
      'page',
      'pageSize',
      'pendingWrongCount',
      'pointsAwarded',
      'pointsBalance',
      'pointsCost',
      'pointsCostSnapshot',
      'position',
      'stock',
      'total',
      'totalPages',
      'unansweredCount',
    ]);
    const offenders: string[] = [];
    for (const [schemaName, rawSchema] of Object.entries(
      document.components?.schemas ?? {},
    )) {
      if (isReference(rawSchema)) {
        continue;
      }
      for (const [fieldName, rawProperty] of Object.entries(
        rawSchema.properties ?? {},
      )) {
        if (!integerFields.has(fieldName) || isReference(rawProperty)) {
          continue;
        }
        const property = rawProperty as SchemaObject;
        if (property.type !== 'integer' || property.format !== 'int32') {
          offenders.push(`${schemaName}.${fieldName}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
