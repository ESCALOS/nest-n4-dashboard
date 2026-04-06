import { SspPermissionScope } from '@prisma/client';

export interface SspPermissionClassificationDto {
    bl_item_gkey: number;
    permission_nbr: string;
    permission_scope: SspPermissionScope | null;
}