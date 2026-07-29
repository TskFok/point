import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
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
  constructor(private readonly strategy: AccessTokenStrategy) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authentication = await this.strategy.authenticate(request);
    request.user = authentication.user;
    request.authSource = authentication.source;
    return true;
  }
}
