import { Role } from '@prisma/client';

export interface JwtPayload {
    sub: string;
    email: string;
    role: Role;
}

export interface ActiveUser {
    userId: string;
    email: string;
    role: Role;
}
