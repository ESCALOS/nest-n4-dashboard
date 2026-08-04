import { Privilege } from '@prisma/client';
import { PrismaService } from '../database/prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService privileges', () => {
    it('persists an empty or populated privilege list during update', async () => {
        const findUnique = jest.fn().mockResolvedValue({
            id: 'user-id',
            email: 'user@example.com',
            privileges: [],
        });
        const update = jest.fn().mockResolvedValue({
            id: 'user-id',
            privileges: [Privilege.VIEW_TPR_REPORT],
        });
        const prisma = { user: { findUnique, update } };
        const service = new UsersService(prisma as unknown as PrismaService);

        await service.update('user-id', {
            privileges: [Privilege.VIEW_TPR_REPORT],
        });

        expect(update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'user-id' },
            data: { privileges: [Privilege.VIEW_TPR_REPORT] },
        }));
    });
});
