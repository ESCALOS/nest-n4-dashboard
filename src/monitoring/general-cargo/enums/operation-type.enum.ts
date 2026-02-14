export enum OperationType {
    STOCKPILING = 'STOCKPILING',
    INDIRECT_LOADING = 'INDIRECT_LOADING',
    DISPATCHING = 'DISPATCHING',
    DIRECT_LOADING = 'DIRECT_LOADING',
}

export const IS_BL_ITEM_AS: Record<OperationType, boolean> = {
    [OperationType.STOCKPILING]: true,
    [OperationType.INDIRECT_LOADING]: false,
    [OperationType.DISPATCHING]: false,
    [OperationType.DIRECT_LOADING]: false,
};

export const IS_GATE_TRANSACTION: Record<OperationType, boolean> = {
    [OperationType.STOCKPILING]: true,
    [OperationType.INDIRECT_LOADING]: false,
    [OperationType.DISPATCHING]: true,
    [OperationType.DIRECT_LOADING]: true,
};