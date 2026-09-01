export enum TprReportType {
  ALL = 'ALL',
  CONTAINER_VESSEL = 'CONTAINER_VESSEL',
  TRUCK_IN_OUT = 'TRUCK_IN_OUT',
  PERFORMANCE_EQUIPMENT = 'PERFORMANCE_EQUIPMENT',
}

export type TprDetailReportType =
  | TprReportType.CONTAINER_VESSEL
  | TprReportType.TRUCK_IN_OUT
  | TprReportType.PERFORMANCE_EQUIPMENT;

export enum TprEquipmentOwnership {
  ALL = 'ALL',
  INTERNAL = 'INTERNAL',
  RENTED = 'RENTED',
}

export enum TprDetailKind {
  MOVEMENTS = 'MOVEMENTS',
  VESSEL_CALLS = 'VESSEL_CALLS',
  EQUIPMENT_MOVES = 'EQUIPMENT_MOVES',
}

export interface TprOperationalSummaryRow {
  uniqueId: string;
  accountDescription: string;
  total: number;
  reportType: TprDetailReportType;
  supportsDetails: boolean;
}

export interface TprSummaryRow {
  uniqueId: string;
  accountDescription: string;
  total: number;
  reportType: TprDetailReportType | null;
  hasDetails: boolean;
}

export interface TprSummaryResponse {
  period: string;
  generatedAt: string;
  cached: boolean;
  rows: TprSummaryRow[];
}

export interface TprDetailRow {
  movementDate: string;
  container: string;
  operation: string;
  status: string;
  equipment: string;
  size: string;
  iso: string;
  containerType: string;
  category: string;
  shippingLine: string | null;
  shippingLineName: string | null;
  manifest: string | null;
  vessel: string | null;
}

export interface TprVesselCallDetailRow {
  atd: string;
  manifest: string;
  vessel: string | null;
}

export interface TprEquipmentDetailRow {
  equipment: string;
  ownership: Exclude<TprEquipmentOwnership, TprEquipmentOwnership.ALL>;
  total: number;
}

export type TprBusinessDetailRow =
  | TprDetailRow
  | TprVesselCallDetailRow
  | TprEquipmentDetailRow;

export interface TprDetailResponse {
  period: string;
  reportType: TprDetailReportType;
  uniqueId: string;
  accountDescription: string;
  generatedAt: string;
  cached: boolean;
  detailKind: TprDetailKind;
  filteredTotal: number;
  rows: TprBusinessDetailRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TprSummarySqlRow {
  unique_id: string;
  account_description: string;
  total: number;
}

export interface TprDetailSqlRow {
  account_description: string;
  movement_date: Date | string;
  container: string;
  operation: string;
  normalized_status: string;
  normalized_equipment: string;
  size_description: string;
  iso: string;
  container_type: string;
  category: string;
  shipping_line: string | null;
  shipping_line_name: string | null;
  manifest: string | null;
  vessel: string | null;
  total_count: number;
}

export interface TprVesselCallDetailSqlRow {
  account_description: string;
  atd: Date | string;
  manifest: string;
  vessel: string | null;
  total_count: number;
}

export interface TprEquipmentDetailSqlRow {
  account_description: string;
  equipment: string;
  ownership: 'INTERNAL' | 'RENTED';
  total: number;
  total_count: number;
  filtered_total: number;
}

export interface TprCachedSummary {
  generatedAt: string;
  rows: TprOperationalSummaryRow[];
}

export interface TprCachedDetailPage {
  generatedAt: string;
  accountDescription: string;
  total: number;
  detailKind: TprDetailKind;
  filteredTotal: number;
  rows: TprBusinessDetailRow[];
}
