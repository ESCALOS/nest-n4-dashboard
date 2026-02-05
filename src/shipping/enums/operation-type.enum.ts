export enum OperationType {
  ACOPIO = 'ACOPIO',
  EMBARQUE_INDIRECTO = 'EMBARQUE_INDIRECTO',
  DESPACHO = 'DESPACHO',
  EMBARQUE_DIRECTO = 'EMBARQUE_DIRECTO',
  DESCARGA = 'DESCARGA',
}

/**
 * Maps operation types to their BL item pattern
 * SSP = Embarque/Despacho services
 * OS = Acopio services
 */
export const OPERATION_BL_PATTERN: Record<OperationType, 'SSP' | 'OS'> = {
  [OperationType.ACOPIO]: 'OS',
  [OperationType.EMBARQUE_INDIRECTO]: 'SSP',
  [OperationType.DESPACHO]: 'SSP',
  [OperationType.EMBARQUE_DIRECTO]: 'SSP',
  [OperationType.DESCARGA]: 'SSP',
};
