import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ActiveUser } from '../interfaces/jwt-payload.interface';

export const GetUser = createParamDecorator(
    (data: keyof ActiveUser | undefined, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        const user = request.user as ActiveUser;
        return data ? user?.[data] : user;
    },
);
