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

export class SummaryJornadaDto {
  peso: number;
  bultos: number;
}

export class SummaryByKeyDto {
  bultos: number;
  peso: number;
}

export class SummaryBlItemDto {
  gkey: string;
  nbr: string;
  pesoManifestado: number;
  bultosManifestados: number;
  pesoDescargado: number;
  bultosDescargados: number;
  porcentajePeso: number;
  porcentajeBultos: number;
  jornadas: Record<string, SummaryJornadaDto>;
}

export class SummaryBodegaDto {
  gkey: string;
  nbr: string;
  pesoManifestado: number;
  bultosManifestados: number;
  pesoDescargado: number;
  bultosDescargados: number;
  porcentajePeso: number;
  porcentajeBultos: number;
  jornadas: Record<string, SummaryJornadaDto>;
}

export class SummaryDto {
  totalBultos: number;
  totalPeso: number;
  blItems: SummaryBlItemDto[];
  bodegas: SummaryBodegaDto[];
}

export class OperationResponseDto {
  manifest: ManifestDto;
  bodegas: BodegaDto[];
  blItems: BlItemDto[];
  transactions: TransactionDto[];
  summary: SummaryDto;
}
