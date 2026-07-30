import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags, getSchemaPath } from '@nestjs/swagger';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { ApiContract } from '../openapi/api-contract.decorator';
import {
  LoginRequestDto,
  RefreshRequestDto,
  RegisterRequestDto,
  SuccessResponseDto,
  TokenResponseDto,
  UserResponseDto,
  WebSessionResponseDto,
} from '../openapi/api-contract.models';
import {
  AuthService,
  type RotatedTokenPair,
  type TokenPair,
} from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { MayUseRefreshCookie } from './decorators/refresh-cookie.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import type { RequestUser } from './strategies/access-token.strategy';

const ACCESS_COOKIE_MILLISECONDS = 15 * 60 * 1000;
const REFRESH_COOKIE_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_CSRF_DESCRIPTION =
  '使用 pq_refresh Cookie 刷新或注销时必填；body refreshToken 模式勿填';
const SESSION_COOKIE_HEADER = {
  description:
    '设置或刷新 pq_access（HttpOnly）、pq_refresh（HttpOnly）与 pq_csrf（可由 JavaScript 读取）Cookie',
  schema: {
    type: 'array',
    items: { type: 'string' },
  },
};
const CLEAR_SESSION_COOKIE_HEADER = {
  description:
    'pq_refresh Cookie 模式注销时清除 pq_access、pq_refresh 与 pq_csrf Cookie；body refreshToken 模式不改写 Cookie',
  schema: {
    type: 'array',
    items: { type: 'string' },
  },
};

function cookieOptions(httpOnly: boolean, maxAge: number) {
  return {
    httpOnly,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge,
    path: '/',
  };
}

function setWebCookies(response: Response, tokens: TokenPair): void {
  response.cookie(
    'pq_access',
    tokens.accessToken,
    cookieOptions(true, ACCESS_COOKIE_MILLISECONDS),
  );
  response.cookie(
    'pq_refresh',
    tokens.refreshToken,
    cookieOptions(true, REFRESH_COOKIE_MILLISECONDS),
  );
  response.cookie(
    'pq_csrf',
    randomBytes(32).toString('base64url'),
    cookieOptions(false, REFRESH_COOKIE_MILLISECONDS),
  );
}

function clearWebCookies(response: Response): void {
  const common = {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };
  response.clearCookie('pq_access', { ...common, httpOnly: true });
  response.clearCookie('pq_refresh', { ...common, httpOnly: true });
  response.clearCookie('pq_csrf', { ...common, httpOnly: false });
}

function rawRefreshToken(
  request: Request,
  body: RefreshDto,
): string | undefined {
  return (
    body.refreshToken ?? (request.cookies?.pq_refresh as string | undefined)
  );
}

@Controller('auth')
@ApiTags('认证')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @ApiContract({
    operationId: 'authRegister',
    summary: '注册学生账号',
    responseType: UserResponseDto,
    responseStatus: 201,
    bodyType: RegisterRequestDto,
  })
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post('login')
  @Public()
  @ApiContract({
    operationId: 'authLoginWeb',
    summary: 'Web 登录并写入认证 Cookie',
    description:
      '认证成功后设置 pq_access（HttpOnly）、pq_refresh（HttpOnly）和 pq_csrf（可由 JavaScript 读取）Cookie。',
    responseType: WebSessionResponseDto,
    responseStatus: 201,
    bodyType: LoginRequestDto,
    response: {
      type: WebSessionResponseDto,
      headers: { 'Set-Cookie': SESSION_COOKIE_HEADER },
    },
  })
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const tokens = await this.authService.login(body, 'WEB');
    setWebCookies(response, tokens);
    return { user: tokens.user };
  }

  @Post('token')
  @Public()
  @ApiContract({
    operationId: 'authIssueAndroidToken',
    summary: 'Android 登录并获取令牌',
    responseType: TokenResponseDto,
    responseStatus: 201,
    bodyType: LoginRequestDto,
  })
  token(@Body() body: LoginDto) {
    return this.authService.login(body, 'ANDROID');
  }

  @Post('refresh')
  @Public()
  @MayUseRefreshCookie()
  @ApiContract({
    operationId: 'authRefresh',
    summary: '轮换 Web Cookie 或 Android 令牌',
    description:
      '不提供 body refreshToken 时使用 pq_refresh Cookie，并刷新 pq_access、pq_refresh、pq_csrf；提供 body refreshToken 时返回 Android TokenPair 且不改写 Cookie。',
    responseStatus: 201,
    bodyType: RefreshRequestDto,
    csrf: true,
    csrfDescription: REFRESH_CSRF_DESCRIPTION,
    extraModels: [WebSessionResponseDto, TokenResponseDto],
    response: {
      description: 'Web 会话或 Android TokenPair',
      schema: {
        oneOf: [
          { $ref: getSchemaPath(WebSessionResponseDto) },
          { $ref: getSchemaPath(TokenResponseDto) },
        ],
      },
      headers: { 'Set-Cookie': SESSION_COOKIE_HEADER },
    },
  })
  async refresh(
    @Body() body: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = rawRefreshToken(request, body);
    if (!token) {
      return this.authService.refresh('');
    }
    const tokens = await this.authService.refresh(token);
    if (tokens.clientType === 'WEB') {
      setWebCookies(response, tokens);
      return { user: tokens.user };
    }
    return this.androidTokenResponse(tokens);
  }

  @Post('logout')
  @HttpCode(200)
  @Public()
  @MayUseRefreshCookie()
  @ApiContract({
    operationId: 'authLogout',
    summary: '注销当前 Refresh Token',
    description:
      'pq_refresh Cookie 模式会注销并清除 pq_access、pq_refresh、pq_csrf；body refreshToken 模式仅注销对应 Token 且不改写 Cookie。',
    responseType: SuccessResponseDto,
    responseStatus: 200,
    bodyType: RefreshRequestDto,
    csrf: true,
    csrfDescription: REFRESH_CSRF_DESCRIPTION,
    response: {
      type: SuccessResponseDto,
      headers: { 'Set-Cookie': CLEAR_SESSION_COOKIE_HEADER },
    },
  })
  async logout(
    @Body() body: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(rawRefreshToken(request, body));
    if (!body.refreshToken && request.cookies?.pq_refresh) {
      clearWebCookies(response);
    }
    return { success: true };
  }

  @Get('me')
  @ApiContract({
    operationId: 'authGetCurrentUser',
    summary: '获取当前用户',
    responseType: UserResponseDto,
    authenticated: true,
  })
  me(@CurrentUser() user: RequestUser) {
    return { user };
  }

  private androidTokenResponse(tokens: RotatedTokenPair): TokenPair {
    return {
      user: tokens.user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresIn: tokens.accessTokenExpiresIn,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
    };
  }
}
