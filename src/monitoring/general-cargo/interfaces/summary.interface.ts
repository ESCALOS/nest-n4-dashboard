export interface Summary {
    id: number;
    nbr: string;
    commodity?: string;
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