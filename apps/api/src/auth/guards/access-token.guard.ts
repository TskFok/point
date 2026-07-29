import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PUBLIC_ROUTE_KEY } from '../decorators/public.decorator';
import {
  AccessTokenStrategy,
  type AuthenticationSource,
  type RequestUser,
} from '../strategies/access-token.strategy';

export type AuthenticatedRequest = Request & {
  user: RequestUser;
  authSource: AuthenticationSource;
};

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly strategy: AccessTokenStrategy,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authentication = await this.strategy.authenticate(request);
    request.user = authentication.user;
    request.authSource = authentication.source;
    return true;
  }
}
