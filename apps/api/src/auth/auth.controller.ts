import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  AuthService,
  type RotatedTokenPair,
  type TokenPair,
} from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { AccessTokenGuard } from './guards/access-token.guard';
import type { RequestUser } from './strategies/access-token.strategy';

const ACCESS_COOKIE_MILLISECONDS = 15 * 60 * 1000;
const REFRESH_COOKIE_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;

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
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const tokens = await this.authService.login(body, 'WEB');
    setWebCookies(response, tokens);
    return { user: tokens.user };
  }

  @Post('token')
  token(@Body() body: LoginDto) {
    return this.authService.login(body, 'ANDROID');
  }

  @Post('refresh')
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
  async logout(
    @Body() body: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(rawRefreshToken(request, body));
    clearWebCookies(response);
    return { success: true };
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
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
