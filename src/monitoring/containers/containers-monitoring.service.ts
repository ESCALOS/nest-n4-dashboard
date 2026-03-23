import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { N4Service } from 'src/database/n4/n4.service';
import { RedisService } from 'src/database/redis/redis.service';
import { CACHE_KEYS } from 'src/common/constants/cache-keys.constant';
import { ContainerMonitoringResult, ContainerMonitoringRefreshResult } from 'src/database/n4/n4.interfaces';
import {
    ContainerMonitoringDataDto,
    ContainerMonitoringItemDto,
    ContainerOperationStatus,
} from './dto/container-monitoring-response.dto';

export interface ContainerManifestInfo {
    id: string;
    gkey: number;
    vessel_name: string;
}

@Injectable()
export class ContainersMonitoringService {
    private readonly logger = new Logger(ContainersMonitoringService.name);

    constructor(
        private readonly n4Service: N4Service,
        private readonly redisService: RedisService,
    ) { }

    // ============================================
    // MONITORED VESSELS MANAGEMENT
    // ============================================

    async addMonitoredVessel(manifestId: string): Promise<ContainerManifestInfo> {
        const manifest = await this.validateAndGetManifest(manifestId);
        await this.redisService.sadd(CACHE_KEYS.containerMonitoredVessels, manifestId);

        // First load: full query with OUTER APPLY to populate planned positions cache
        await this.fullLoadAndCache(manifestId, manifest);

        this.logger.log(`Added container monitored vessel: ${manifestId} (${manifest.vessel_name})`);
        return manifest;
    }

    async removeMonitoredVessel(manifestId: string): Promise<void> {
        await this.redisService.srem(CACHE_KEYS.containerMonitoredVessels, manifestId);

        // Clean up cached data
        await Promise.all([
            this.redisService.del(CACHE_KEYS.containerData(manifestId)),
            this.redisService.del(CACHE_KEYS.containerPlannedPositions(manifestId)),
        ]);

        this.logger.log(`Removed container monitored vessel: ${manifestId}`);
    }

    async getMonitoredVessels(): Promise<ContainerManifestInfo[]> {
        const members = await this.redisService.smembers(CACHE_KEYS.containerMonitoredVessels);

        const results = await Promise.all(
            members.map(async (manifestId) => {
                try {
                    return await this.getManifestInfo(manifestId);
                } catch {
                    return { id: manifestId, gkey: 0, vessel_name: 'Desconocido' };
                }
            }),
        );

        return results;
    }

    // ============================================
    // DATA FETCHING
    // ============================================

    /**
     * Get monitoring data from Redis cache (populated by job).
     * Falls back to full load if cache miss.
     */
    async getMonitoringData(manifestId: string): Promise<ContainerMonitoringDataDto> {
        const cached = await this.redisService.getJson<ContainerMonitoringDataDto>(
            CACHE_KEYS.containerData(manifestId),
        );

        if (cached) {
            return cached;
        }

        // Cache miss — do a full load
        const manifest = await this.validateAndGetManifest(manifestId);
        return this.fullLoadAndCache(manifestId, manifest);
    }

    /**
     * Full load: query WITH OUTER APPLY → cache planned positions + build & cache data.
     * Used on first add and on cache miss.
     */
    async fullLoadAndCache(
        manifestId: string,
        manifest?: ContainerManifestInfo,
    ): Promise<ContainerMonitoringDataDto> {
        const info = manifest ?? await this.validateAndGetManifest(manifestId);
        const rows = await this.n4Service.getContainerMonitoringFull(info.gkey);

        // Cache planned positions: Map<unit_gkey, pos_slot>
        const plannedPositions: Record<string, string> = {};
        for (const row of rows) {
            if (row.planned_position) {
                plannedPositions[String(row.unit_gkey)] = row.planned_position;
            }
        }
        await this.redisService.setJson(
            CACHE_KEYS.containerPlannedPositions(manifestId),
            plannedPositions,
        );

        // Build response
        const data = this.buildMonitoringData(rows, info);

        // Cache full response
        await this.redisService.setJson(CACHE_KEYS.containerData(manifestId), data);

        this.logger.debug(`Full load cached for ${manifestId}: ${rows.length} units`);
        return data;
    }

    /**
     * Refresh load: query WITHOUT OUTER APPLY → merge planned positions from cache → build & cache data.
     * Called by background job every 30s.
     */
    async refreshAndCache(manifestId: string): Promise<ContainerMonitoringDataDto> {
        const info = await this.getManifestInfo(manifestId);
        const rows = await this.n4Service.getContainerMonitoringRefresh(info.gkey);

        // Get cached planned positions
        const plannedPositions = await this.redisService.getJson<Record<string, string>>(
            CACHE_KEYS.containerPlannedPositions(manifestId),
        ) ?? {};

        // Check for new units that don't have cached planned positions
        const newUnitGkeys: number[] = [];
        for (const row of rows) {
            if (!plannedPositions[String(row.unit_gkey)]) {
                newUnitGkeys.push(row.unit_gkey);
            }
        }

        // If there are new units without planned positions, do a targeted full query
        // to get their planned positions (this handles late-arriving containers)
        if (newUnitGkeys.length > 0) {
            this.logger.debug(
                `Found ${newUnitGkeys.length} new units without planned positions for ${manifestId}, doing full refresh`,
            );
            return this.fullLoadAndCache(manifestId, info);
        }

        // Merge planned_position into refresh rows
        const fullRows: ContainerMonitoringResult[] = rows.map((row) => ({
            ...row,
            planned_position: plannedPositions[String(row.unit_gkey)] ?? null,
        }));

        const data = this.buildMonitoringData(fullRows, info);
        await this.redisService.setJson(CACHE_KEYS.containerData(manifestId), data);

        this.logger.debug(`Refresh cached for ${manifestId}: ${rows.length} units`);
        return data;
    }

    // ============================================
    // WORKING VESSELS (from N4)
    // ============================================

    async getWorkingVessels() {
        return this.n4Service.getWorkingVessels();
    }

    // ============================================
    // INTERNAL: Manifest resolution
    // ============================================

    private async validateAndGetManifest(manifestId: string): Promise<ContainerManifestInfo> {
        const manifest = await this.n4Service.getContainerManifest(manifestId);

        if (!manifest) {
            throw new NotFoundException(`El manifiesto ${manifestId} no existe en N4`);
        }

        if ((manifest.cargo_type ?? '').toUpperCase() !== 'CONT') {
            throw new BadRequestException(
                `El manifiesto ${manifestId} no es de contenedores (flex_string01 <> CONT)`,
            );
        }

        return {
            id: manifest.manifest_id ?? manifestId,
            gkey: manifest.gkey,
            vessel_name: manifest.vessel_name,
        };
    }

    private async getManifestInfo(manifestId: string): Promise<ContainerManifestInfo> {
        const manifest = await this.n4Service.getContainerManifest(manifestId);
        if (!manifest) {
            throw new NotFoundException(`El manifiesto ${manifestId} no existe en N4`);
        }
        return {
            id: manifest.manifest_id ?? manifestId,
            gkey: manifest.gkey,
            vessel_name: manifest.vessel_name,
        };
    }

    // ============================================
    // INTERNAL: Data building
    // ============================================

    private buildMonitoringData(
        rows: ContainerMonitoringResult[],
        manifest: ContainerManifestInfo,
    ): ContainerMonitoringDataDto {
        const containers = rows
            .map((row) => this.mapContainer(row, manifest.gkey))
            .filter((item): item is ContainerMonitoringItemDto => item !== null);

        const summary = this.buildSummary(containers);
        const pendingByBay = this.buildPendingByBay(containers);

        return {
            manifest: {
                id: manifest.id,
                gkey: manifest.gkey,
                vessel_name: manifest.vessel_name,
            },
            summary,
            pending_by_bay: pendingByBay,
            containers,
            last_update: new Date().toISOString(),
        };
    }

    private mapContainer(
        row: ContainerMonitoringResult,
        manifestGkey: number,
    ): ContainerMonitoringItemDto | null {
        const operationStatus = this.resolveOperationStatus(row, manifestGkey);
        if (!operationStatus) return null;

        const size = this.resolveSize(row.nominal_length);
        const bay = this.extractBay(row, operationStatus);

        return {
            unit_gkey: row.unit_gkey,
            container_number: row.container_number,
            iso_type: row.iso_type ?? 'N.E.',
            technology: row.technology ?? 'N.E.',
            size,
            operation_status: operationStatus,
            position: row.position ?? 'N.E.',
            arrival_position: row.arrival_position ?? 'N.E.',
            planned_position: row.planned_position ?? 'N.E.',
            freight_kind: row.freight_kind ?? 'N.E.',
            bay,
        };
    }

    private resolveOperationStatus(
        row: ContainerMonitoringResult,
        manifestGkey: number,
    ): ContainerOperationStatus | null {
        // Reestiba
        if (
            row.actual_ib_cv === manifestGkey &&
            row.category === 'THRGH' &&
            row.restow_typ === 'RESTOW'
        ) {
            if (row.transit_state === 'S20_INBOUND') return 'RESTOW_PENDING';
            if (row.transit_state === 'S40_YARD') return 'RESTOW_ON_YARD';
            if (row.transit_state === 'S60_LOADED' || row.transit_state === 'S70_DEPARTED')
                return 'RESTOW_COMPLETED';
        }

        // Descarga
        if (row.actual_ib_cv === manifestGkey && row.category === 'IMPRT') {
            if (row.transit_state === 'S20_INBOUND') return 'TO_DISCHARGE';
        }

        if (row.actual_ib_cv === manifestGkey && row.category === 'STRGE') {
            if (
                row.transit_state === 'S40_YARD' ||
                row.transit_state === 'S50_ECOUT' ||
                row.transit_state === 'S60_LOADED' ||
                row.transit_state === 'S70_DEPARTED'
            )
                return 'DISCHARGED';
        }

        // Embarque
        if (row.actual_ob_cv === manifestGkey && row.category === 'EXPRT') {
            if (row.transit_state === 'S20_INBOUND') return 'NOT_ARRIVED';
            if (row.transit_state === 'S40_YARD') return 'TO_LOAD';
            if (row.transit_state === 'S60_LOADED' || row.transit_state === 'S70_DEPARTED')
                return 'LOADED';
        }

        return null;
    }

    private resolveSize(nominalLength: number | null): 20 | 40 | null {
        if (nominalLength === 20 || nominalLength === 40) return nominalLength;
        if (nominalLength === null || nominalLength === undefined) return null;
        return nominalLength < 30 ? 20 : 40;
    }

    /**
     * Extract bay from container position.
     * Discharge/Restow → arrival_position (where they came from on the vessel)
     * Load (NOT_ARRIVED/TO_LOAD) → planned_position (where they will go)
     * Loaded → position (last_pos_slot, actual vessel position: BBRRTT → BB = bay)
     */
    private extractBay(
        row: ContainerMonitoringResult,
        operationStatus: ContainerOperationStatus,
    ): number | null {
        let pos: string | null = null;

        if (
            operationStatus === 'TO_DISCHARGE' ||
            operationStatus === 'DISCHARGED' ||
            operationStatus === 'RESTOW_PENDING' ||
            operationStatus === 'RESTOW_ON_YARD' ||
            operationStatus === 'RESTOW_COMPLETED'
        ) {
            pos = row.arrival_position;
        } else if (operationStatus === 'NOT_ARRIVED' || operationStatus === 'TO_LOAD') {
            pos = row.planned_position;
        } else if (operationStatus === 'LOADED') {
            // For loaded containers, use actual position (last_pos_slot)
            pos = row.position;
        }

        if (!pos) return null;

        const normalized = pos.trim();
        if (!/^\d{6}$/.test(normalized)) return null;

        return Number(normalized.slice(0, 2));
    }

    private buildSummary(containers: ContainerMonitoringItemDto[]) {
        const toDischarge = containers.filter((c) => c.operation_status === 'TO_DISCHARGE').length;
        const discharged = containers.filter((c) => c.operation_status === 'DISCHARGED').length;
        const notArrived = containers.filter((c) => c.operation_status === 'NOT_ARRIVED').length;
        const toLoad = containers.filter((c) => c.operation_status === 'TO_LOAD').length;
        const loaded = containers.filter((c) => c.operation_status === 'LOADED').length;
        const restowPending = containers.filter((c) => c.operation_status === 'RESTOW_PENDING').length;
        const restowOnYard = containers.filter((c) => c.operation_status === 'RESTOW_ON_YARD').length;
        const restowCompleted = containers.filter((c) => c.operation_status === 'RESTOW_COMPLETED').length;

        return {
            total_units: containers.length,
            discharge: {
                to_discharge: toDischarge,
                discharged,
                total: toDischarge + discharged,
            },
            load: {
                not_arrived: notArrived,
                to_load: toLoad,
                loaded,
                total: notArrived + toLoad + loaded,
            },
            restow: {
                pending: restowPending,
                on_yard: restowOnYard,
                completed: restowCompleted,
                total: restowPending + restowOnYard + restowCompleted,
            },
        };
    }

    private buildPendingByBay(containers: ContainerMonitoringItemDto[]) {
        const dischargeBays = new Map<number, number>();
        const loadBays = new Map<number, number>();
        const notArrivedBays = new Map<number, number>();
        const restowBays = new Map<number, number>();

        for (const c of containers) {
            if (c.bay === null) continue;

            if (c.operation_status === 'TO_DISCHARGE') {
                dischargeBays.set(c.bay, (dischargeBays.get(c.bay) ?? 0) + 1);
            } else if (c.operation_status === 'TO_LOAD') {
                loadBays.set(c.bay, (loadBays.get(c.bay) ?? 0) + 1);
            } else if (c.operation_status === 'NOT_ARRIVED') {
                notArrivedBays.set(c.bay, (notArrivedBays.get(c.bay) ?? 0) + 1);
            } else if (c.operation_status === 'RESTOW_PENDING') {
                restowBays.set(c.bay, (restowBays.get(c.bay) ?? 0) + 1);
            }
        }

        const toSorted = (map: Map<number, number>) =>
            Array.from(map.entries())
                .map(([bay, pending]) => ({ bay, pending }))
                .sort((a, b) => a.bay - b.bay);

        return {
            discharge: toSorted(dischargeBays),
            load: toSorted(loadBays),
            not_arrived: toSorted(notArrivedBays),
            restow: toSorted(restowBays),
        };
    }
}
