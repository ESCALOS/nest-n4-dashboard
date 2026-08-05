import { GeneralCargoService } from './general-cargo.service';
import {
  IS_GATE_TRANSACTION,
  OperationType,
} from './enums/operation-type.enum';
import { ManifestDto } from './dto/manifest.dto';

describe('GeneralCargoService BL selection', () => {
  const manifest: ManifestDto = {
    id: '2026-100',
    gkey: 100,
    vvdGkey: 200,
    vesselName: 'Test Vessel',
  };

  const regularItem = {
    gkey: 1,
    nbr: 'BL-1',
    manifested_weight: 100,
    manifested_goods: 10,
    commodity_gkey: 1,
  };
  const maizeItem = {
    ...regularItem,
    nbr: 'SSP-1',
    commodity_gkey: 95,
  };

  let n4Service: {
    getBLItems: jest.Mock;
    getBLItemsByPrefix: jest.Mock;
  };
  let redisService: {
    getJson: jest.Mock;
    setJson: jest.Mock;
  };
  let service: GeneralCargoService;

  beforeEach(() => {
    n4Service = {
      getBLItems: jest.fn(),
      getBLItemsByPrefix: jest.fn(),
    };
    redisService = {
      getJson: jest.fn().mockResolvedValue(null),
      setJson: jest.fn().mockResolvedValue(undefined),
    };
    service = new GeneralCargoService(
      n4Service as any,
      redisService as any,
      {} as any,
    );
  });

  it.each([
    OperationType.DIRECT_LOADING,
    OperationType.INDIRECT_LOADING,
  ])('uses EXPRT non-AS BL items for %s', async (operationType) => {
    n4Service.getBLItems.mockResolvedValue([regularItem]);

    await service.getBLItems(
      manifest.id,
      operationType,
      manifest,
    );

    expect(n4Service.getBLItems).toHaveBeenCalledWith(100, false, 'EXPRT');
    expect(n4Service.getBLItemsByPrefix).not.toHaveBeenCalled();
  });

  it('uses Gate for direct loading and Control de Pesaje for indirect loading', () => {
    expect(IS_GATE_TRANSACTION[OperationType.DIRECT_LOADING]).toBe(true);
    expect(IS_GATE_TRANSACTION[OperationType.INDIRECT_LOADING]).toBe(false);
    expect(IS_GATE_TRANSACTION[OperationType.DISPATCHING]).toBe(true);
    expect(IS_GATE_TRANSACTION[OperationType.DISCHARGING]).toBe(true);
  });

  it.each([OperationType.DISPATCHING, OperationType.DISCHARGING])(
    'uses the same IMPRT SSP rule for %s',
    async (operationType) => {
      n4Service.getBLItems
        .mockResolvedValueOnce([maizeItem])
        .mockResolvedValueOnce([]);
      n4Service.getBLItemsByPrefix.mockResolvedValue([maizeItem]);

      await service.getBLItems(manifest.id, operationType, manifest);

      expect(n4Service.getBLItems).toHaveBeenNthCalledWith(1, 100, false, 'IMPRT');
      expect(n4Service.getBLItems).toHaveBeenNthCalledWith(2, 100, true, 'IMPRT');
      expect(n4Service.getBLItemsByPrefix).toHaveBeenCalledWith(
        100,
        'SSP',
        false,
        'IMPRT',
      );
    },
  );

  it('keeps the IMPRT AS and OS rules for maize stockpiling', async () => {
    n4Service.getBLItems
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...maizeItem, nbr: 'OS-1' }]);
    n4Service.getBLItemsByPrefix.mockResolvedValue([
      { ...maizeItem, nbr: 'OS-1' },
    ]);

    await service.getBLItems(
      manifest.id,
      OperationType.STOCKPILING,
      manifest,
    );

    expect(n4Service.getBLItemsByPrefix).toHaveBeenCalledWith(
      100,
      'OS',
      true,
      'IMPRT',
    );
  });
});
