import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { N4Service, TransactionResult } from '../database/n4/n4.service';
import { RedisService } from '../database/redis/redis.service';
import { CACHE_KEYS } from '../common/constants/cache-keys.constant';
import {
  OperationType,
  OPERATION_BL_PATTERN,
} from './enums/operation-type.enum';
import { ManifestDto } from './dto/manifest.dto';
import { BodegaDto } from './dto/bodega.dto';
import { BlItemDto } from './dto/bl-item.dto';
import {
  OperationResponseDto,
  TransactionDto,
  SummaryDto,
} from './dto/operation-response.dto';

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly n4Service: N4Service,
    private readonly redisService: RedisService,
  ) {}

  // ============================================
  // MANIFEST METHODS
  // ============================================

  async getManifest(manifestId: string): Promise<ManifestDto> {
    const cacheKey = CACHE_KEYS.manifest(manifestId);

    // Check cache first
    const cached = await this.redisService.getJson<ManifestDto>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for manifest ${manifestId}`);
      return cached;
    }

    // Query N4
    const result = await this.n4Service.getManifest(manifestId);
    if (!result) {
      throw new NotFoundException(`Manifest ${manifestId} not found`);
    }

    const manifest: ManifestDto = {
      id: manifestId,
      cvGkey: result.gkey,
      vvdGkey: result.vvd_gkey,
      vesselName: result.name,
    };

    // Cache without expiry
    await this.redisService.setJson(cacheKey, manifest);

    // Add to active manifests for background job tracking
    await this.redisService.sadd(CACHE_KEYS.activeManifests, manifestId);

    return manifest;
  }

  // ============================================
  // BODEGAS METHODS
  // ============================================

  async getBodegas(manifestId: string): Promise<BodegaDto[]> {
    const manifest = await this.getManifest(manifestId);
    const cacheKey = CACHE_KEYS.bodegas(manifest.vvdGkey);

    // Check cache first
    const cached = await this.redisService.getJson<BodegaDto[]>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for bodegas vvdGkey ${manifest.vvdGkey}`);
      return cached;
    }

    // Query N4
    const results = await this.n4Service.getBodegas(manifest.vvdGkey);
    const bodegas: BodegaDto[] = results.map((r) => ({
      gkey: r.gkey,
      nbr: r.nbr,
      pesoManifestado: r.pesoManifestado,
      bultosManifestados: r.bultosManifestados,
    }));

    // Cache without expiry
    await this.redisService.setJson(cacheKey, bodegas);

    return bodegas;
  }

  // ============================================
  // BL ITEMS METHODS
  // ============================================

  async getBLItems(
    manifestId: string,
    operationType: OperationType,
  ): Promise<BlItemDto[]> {
    const manifest = await this.getManifest(manifestId);
    const pattern = OPERATION_BL_PATTERN[operationType];
    const cacheKey = CACHE_KEYS.blItems(manifest.cvGkey, pattern);

    // Check cache first
    const cached = await this.redisService.getJson<BlItemDto[]>(cacheKey);
    if (cached) {
      this.logger.debug(
        `Cache hit for BL items cvGkey ${manifest.cvGkey} pattern ${pattern}`,
      );
      return cached;
    }

    // Query N4 based on pattern
    const results =
      pattern === 'OS'
        ? await this.n4Service.getBLItemsAcopio(manifest.cvGkey)
        : await this.n4Service.getBLItems(manifest.cvGkey);

    const blItems: BlItemDto[] = results.map((r) => ({
      gkey: r.gkey,
      nbr: r.nbr,
      pesoManifestado: r.pesoManifestado,
      bultosManifestados: r.bultosManifestados,
    }));

    // Cache without expiry
    await this.redisService.setJson(cacheKey, blItems);

    return blItems;
  }

  // ============================================
  // TRANSACTIONS METHODS
  // ============================================

  async getTransactions(
    manifestId: string,
    operationType: OperationType,
  ): Promise<TransactionDto[]> {
    const cacheKey = CACHE_KEYS.transactions(manifestId, operationType);

    // Get from cache (populated by background job)
    const cached = await this.redisService.getJson<TransactionDto[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // If not in cache, fetch directly (first request or cache miss)
    return this.fetchAndCacheTransactions(manifestId, operationType);
  }

  async fetchAndCacheTransactions(
    manifestId: string,
    operationType: OperationType,
  ): Promise<TransactionDto[]> {
    const blItems = await this.getBLItems(manifestId, operationType);
    const blItemGkeys = blItems.map((item) => item.gkey);

    if (blItemGkeys.length === 0) {
      return [];
    }

    let results: TransactionResult[];

    switch (operationType) {
      case OperationType.ACOPIO:
        results = await this.n4Service.getTransactionsAcopio(blItemGkeys);
        break;
      case OperationType.EMBARQUE_INDIRECTO:
        results =
          await this.n4Service.getTransactionsEmbarqueIndirecto(blItemGkeys);
        break;
      case OperationType.DESPACHO:
        results = await this.n4Service.getTransactionsDespacho(blItemGkeys);
        break;
      case OperationType.EMBARQUE_DIRECTO:
        results =
          await this.n4Service.getTransactionsEmbarqueDirecto(blItemGkeys);
        break;
      case OperationType.DESCARGA:
        results = await this.n4Service.getTransactionsDescarga(blItemGkeys);
        break;
      default:
        results = [];
    }

    const transactions: TransactionDto[] = results.map((r) => ({
      bodega: r.bodega,
      blItemGkey: r.blItemGkey,
      jornada: r.jornada,
      totalBultos: r.totalBultos,
      totalPeso: r.totalPeso,
    }));

    // Cache the results
    const cacheKey = CACHE_KEYS.transactions(manifestId, operationType);
    await this.redisService.setJson(cacheKey, transactions);

    return transactions;
  }

  // ============================================
  // AGGREGATED OPERATIONS
  // ============================================

  async getOperations(
    manifestId: string,
    operationType: OperationType,
  ): Promise<OperationResponseDto> {
    // Ensure manifest is tracked
    await this.redisService.sadd(CACHE_KEYS.activeManifests, manifestId);

    // Fetch all data in parallel where possible
    const [manifest, bodegas, blItems, transactions] = await Promise.all([
      this.getManifest(manifestId),
      this.getBodegas(manifestId),
      this.getBLItems(manifestId, operationType),
      this.getTransactions(manifestId, operationType),
    ]);

    // Calculate summary
    const summary = this.calculateSummary(transactions);

    return {
      manifest,
      bodegas,
      blItems,
      transactions,
      summary,
    };
  }

  private calculateSummary(transactions: TransactionDto[]): SummaryDto {
    const summary: SummaryDto = {
      totalBultos: 0,
      totalPeso: 0,
      byBodega: {},
      byJornada: {},
    };

    for (const tx of transactions) {
      summary.totalBultos += tx.totalBultos;
      summary.totalPeso += tx.totalPeso;

      // By bodega
      if (!summary.byBodega[tx.bodega]) {
        summary.byBodega[tx.bodega] = { bultos: 0, peso: 0 };
      }
      summary.byBodega[tx.bodega].bultos += tx.totalBultos;
      summary.byBodega[tx.bodega].peso += tx.totalPeso;

      // By jornada
      if (!summary.byJornada[tx.jornada]) {
        summary.byJornada[tx.jornada] = { bultos: 0, peso: 0 };
      }
      summary.byJornada[tx.jornada].bultos += tx.totalBultos;
      summary.byJornada[tx.jornada].peso += tx.totalPeso;
    }

    return summary;
  }
}
