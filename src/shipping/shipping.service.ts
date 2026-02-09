import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { N4Service } from '../database/n4/n4.service';
import { TransactionResult } from '../database/n4/n4.interfaces';
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
  SummaryBlItemDto,
  SummaryBodegaDto,
} from './dto/operation-response.dto';

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly n4Service: N4Service,
    private readonly redisService: RedisService,
  ) { }

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
    const summary = this.calculateSummary(transactions, blItems, bodegas);

    return {
      manifest,
      bodegas,
      blItems,
      transactions,
      summary,
    };
  }

  private calculateSummary(
    transactions: TransactionDto[],
    blItems: BlItemDto[],
    bodegas: BodegaDto[],
  ): SummaryDto {
    // Initialize total counters
    const totalBultos = transactions.reduce((sum, tx) => sum + tx.totalBultos, 0);
    const totalPeso = transactions.reduce((sum, tx) => sum + tx.totalPeso, 0);

    // Build blItems summary
    const blItemsMap = new Map<string, SummaryBlItemDto>();
    for (const item of blItems) {
      blItemsMap.set(String(item.gkey), {
        gkey: String(item.gkey),
        nbr: item.nbr,
        pesoManifestado: item.pesoManifestado,
        bultosManifestados: item.bultosManifestados,
        pesoDescargado: 0,
        bultosDescargados: 0,
        porcentajePeso: 0,
        porcentajeBultos: 0,
        jornadas: {},
      });
    }

    // Build bodegas summary
    const bodegasMap = new Map<string, SummaryBodegaDto>();
    for (const bodega of bodegas) {
      const bodegaKey = String(bodega.nbr).toUpperCase();
      bodegasMap.set(bodegaKey, {
        gkey: String(bodega.gkey),
        nbr: bodega.nbr,
        pesoManifestado: bodega.pesoManifestado,
        bultosManifestados: bodega.bultosManifestados,
        pesoDescargado: 0,
        bultosDescargados: 0,
        porcentajePeso: 0,
        porcentajeBultos: 0,
        jornadas: {},
      });
    }

    // Process transactions
    for (const tx of transactions) {
      // By blItem
      const blItem = blItemsMap.get(String(tx.blItemGkey));
      if (blItem) {
        blItem.pesoDescargado += tx.totalPeso;
        blItem.bultosDescargados += tx.totalBultos;

        // By jornada for blItem
        if (!blItem.jornadas[tx.jornada]) {
          blItem.jornadas[tx.jornada] = { peso: 0, bultos: 0 };
        }
        blItem.jornadas[tx.jornada].peso += tx.totalPeso;
        blItem.jornadas[tx.jornada].bultos += tx.totalBultos;
      }

      // By bodega
      const txBodegaKey = String(tx.bodega).toUpperCase();
      const bodega = bodegasMap.get(txBodegaKey);
      if (bodega) {
        bodega.pesoDescargado += tx.totalPeso;
        bodega.bultosDescargados += tx.totalBultos;

        // By jornada for bodega
        if (!bodega.jornadas[tx.jornada]) {
          bodega.jornadas[tx.jornada] = { peso: 0, bultos: 0 };
        }
        bodega.jornadas[tx.jornada].peso += tx.totalPeso;
        bodega.jornadas[tx.jornada].bultos += tx.totalBultos;
      }
    }

    // Calculate percentages
    for (const [, blItem] of blItemsMap) {
      blItem.porcentajePeso =
        blItem.pesoManifestado > 0
          ? Number(((blItem.pesoDescargado / blItem.pesoManifestado) * 100).toFixed(2))
          : 0;
      blItem.porcentajeBultos =
        blItem.bultosManifestados > 0
          ? Number(((blItem.bultosDescargados / blItem.bultosManifestados) * 100).toFixed(2))
          : 0;
    }

    for (const [, bodega] of bodegasMap) {
      bodega.porcentajePeso =
        bodega.pesoManifestado > 0
          ? Number(((bodega.pesoDescargado / bodega.pesoManifestado) * 100).toFixed(2))
          : 0;
      bodega.porcentajeBultos =
        bodega.bultosManifestados > 0
          ? Number(((bodega.bultosDescargados / bodega.bultosManifestados) * 100).toFixed(2))
          : 0;
    }

    return {
      totalBultos,
      totalPeso,
      blItems: Array.from(blItemsMap.values()),
      bodegas: Array.from(bodegasMap.values()),
    };
  }
}
