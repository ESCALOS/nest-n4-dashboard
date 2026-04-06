export interface Summary {
    id: number;
    nbr: string;
    commodity?: string;
    is_ssp_permission?: boolean;
    permission_scope?: 'INTERNAL' | 'EXTERNAL' | null;
    weight: {
        manifested: number;
        processed: number;
    };
    goods: {
        manifested: number;
        processed: number;
    }
    shifts: {
        [key: string]: {
            weight: number;
            goods: number;
            tickets: number;
        };
    }
}