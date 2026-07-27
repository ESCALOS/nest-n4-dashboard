export enum TprReportType {
  ALL = 'ALL',
  CONTAINER_VESSEL = 'CONTAINER_VESSEL',
  TRUCK_IN_OUT = 'TRUCK_IN_OUT',
}

export type TprDetailReportType =
  | TprReportType.CONTAINER_VESSEL
  | TprReportType.TRUCK_IN_OUT;

export interface TprOperationalSummaryRow {
  uniqueId: string;
  accountDescription: string;
  total: number;
  reportType: TprDetailReportType;
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

export interface TprDetailResponse {
  period: string;
  reportType: TprDetailReportType;
  uniqueId: string;
  accountDescription: string;
  generatedAt: string;
  cached: boolean;
  rows: TprDetailRow[];
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

export interface TprCachedSummary {
  generatedAt: string;
  rows: TprOperationalSummaryRow[];
}

export interface TprCachedDetailPage {
  generatedAt: string;
  accountDescription: string;
  total: number;
  rows: TprDetailRow[];
}
