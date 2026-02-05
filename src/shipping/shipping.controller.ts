import { Controller, Get, Param, Query } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { GetOperationsDto } from './dto/get-operations.dto';
import { ManifestDto } from './dto/manifest.dto';
import { BodegaDto } from './dto/bodega.dto';
import { BlItemDto } from './dto/bl-item.dto';
import { OperationResponseDto } from './dto/operation-response.dto';
import { OperationType } from './enums/operation-type.enum';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  /**
   * Get manifest information by manifest ID
   */
  @Get('manifest/:manifestId')
  async getManifest(
    @Param('manifestId') manifestId: string,
  ): Promise<ManifestDto> {
    return this.shippingService.getManifest(manifestId);
  }

  /**
   * Get bodegas (warehouses) for a manifest
   */
  @Get('manifest/:manifestId/bodegas')
  async getBodegas(
    @Param('manifestId') manifestId: string,
  ): Promise<BodegaDto[]> {
    return this.shippingService.getBodegas(manifestId);
  }

  /**
   * Get BL items for a manifest
   * Requires operationType to determine the pattern (SSP or OS)
   */
  @Get('manifest/:manifestId/bl-items')
  async getBLItems(
    @Param('manifestId') manifestId: string,
    @Query('operationType') operationType: OperationType,
  ): Promise<BlItemDto[]> {
    return this.shippingService.getBLItems(manifestId, operationType);
  }

  /**
   * Get aggregated operations data
   * This is the main endpoint that returns all data including transactions
   */
  @Get('operations')
  async getOperations(
    @Query() query: GetOperationsDto,
  ): Promise<OperationResponseDto> {
    return this.shippingService.getOperations(
      query.manifestId,
      query.operationType,
    );
  }
}
