import { SetMetadata } from '@nestjs/common';
import { Privilege } from '@prisma/client';

export const PRIVILEGES_KEY = 'privileges';
export const Privileges = (...privileges: Privilege[]) =>
    SetMetadata(PRIVILEGES_KEY, privileges);
