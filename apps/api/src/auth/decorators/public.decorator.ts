import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ROUTE_KEY = 'point-quest:public-route';

export const Public = () => SetMetadata(PUBLIC_ROUTE_KEY, true);
