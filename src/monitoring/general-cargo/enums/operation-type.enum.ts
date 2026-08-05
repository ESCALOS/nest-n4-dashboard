export enum OperationType {
    STOCKPILING = 'STOCKPILING',
    INDIRECT_LOADING = 'INDIRECT_LOADING',
    DISPATCHING = 'DISPATCHING',
    DISCHARGING = 'DISCHARGING',
    DIRECT_LOADING = 'DIRECT_LOADING',
}

export type BlCategory = 'IMPRT' | 'EXPRT';

export const IS_BL_ITEM_AS: Record<OperationType, boolean> = {
    [OperationType.STOCKPILING]: true,
    [OperationType.INDIRECT_LOADING]: false,
    [OperationType.DISPATCHING]: false,
    [OperationType.DISCHARGING]: false,
    [OperationType.DIRECT_LOADING]: false,
};

export const BL_CATEGORY: Record<OperationType, BlCategory> = {
    [OperationType.STOCKPILING]: 'IMPRT',
    [OperationType.INDIRECT_LOADING]: 'EXPRT',
    [OperationType.DISPATCHING]: 'IMPRT',
    [OperationType.DISCHARGING]: 'IMPRT',
    [OperationType.DIRECT_LOADING]: 'EXPRT',
};

export const IS_GATE_TRANSACTION: Record<OperationType, boolean> = {
    [OperationType.STOCKPILING]: true,
    [OperationType.INDIRECT_LOADING]: false,
    [OperationType.DISPATCHING]: true,
    [OperationType.DISCHARGING]: true,
    [OperationType.DIRECT_LOADING]: true,
};
