import { ManifestDto } from './manifest.dto';
import { BodegaDto } from './bodega.dto';
import { BlItemDto } from './bl-item.dto';

export class TransactionDto {
  bodega: string;
  blItemGkey: number;
  jornada: string;
  totalBultos: number;
  totalPeso: number;
}

export class SummaryByKeyDto {
  bultos: number;
  peso: number;
}

export class SummaryDto {
  totalBultos: number;
  totalPeso: number;
  byBodega: Record<string, SummaryByKeyDto>;
  byJornada: Record<string, SummaryByKeyDto>;
}

export class OperationResponseDto {
  manifest: ManifestDto;
  bodegas: BodegaDto[];
  blItems: BlItemDto[];
  transactions: TransactionDto[];
  summary: SummaryDto;
}
