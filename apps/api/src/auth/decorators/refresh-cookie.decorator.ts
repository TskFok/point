import { SetMetadata } from '@nestjs/common';

export const MAY_USE_REFRESH_COOKIE_KEY = 'point-quest:may-use-refresh-cookie';

export const MayUseRefreshCookie = () =>
  SetMetadata(MAY_USE_REFRESH_COOKIE_KEY, true);
