import { AppointmentsService } from './appointments.service';
import { N4Service } from '../database/n4/n4.service';
import { RedisService } from '../database/redis/redis.service';
import { CACHE_KEYS } from '../common/constants/cache-keys.constant';

describe.each(['in-progress', 'pending'])('%s appointment booking line', (kind) => {
  function setup(cachedOrder: unknown = null) {
    const n4 = {
      getPendingAppointments: jest.fn().mockResolvedValue([
        { OrderGkey: 12, VesselVisitGkey: 34 },
      ]),
      getAppointmentsInProgress: jest.fn().mockResolvedValue([
        { OrderGkey: 12, VesselVisitGkey: 34 },
      ]),
      getVesselsByCarrierVisitGkeys: jest.fn().mockResolvedValue([
        { carrier_visit_gkey: 34, manifest_id: 'VISIT', vessel_name: 'VESSEL', line_id: 'VESSEL-LINE' },
      ]),
      getOrderInfoByOrderGkeys: jest.fn().mockResolvedValue([
        { order_gkey: 12, booking: 'BOOKING', commodity: 'PRODUCT', line_id: 'BOOKING-LINE' },
      ]),
    };
    const redis = {
      getJson: jest.fn().mockImplementation(async (key: string) =>
        key === CACHE_KEYS.appointmentOrderInfo(12) ? cachedOrder : null,
      ),
      setJson: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AppointmentsService(
      n4 as unknown as N4Service,
      redis as unknown as RedisService,
    );
    const fetchAppointments = () => kind === 'pending'
      ? service.fetchAndCachePendingAppointments()
      : service.fetchAndCacheAppointments();
    return { fetchAppointments, n4, redis };
  }

  it('uses the booking line even when the vessel line differs', async () => {
    const { fetchAppointments } = setup();
    expect((await fetchAppointments()).data[0].linea).toBe('BOOKING-LINE');
  });

  it('uses the unit operator for a return without a booking', async () => {
    const { fetchAppointments, n4 } = setup();
    const rows = [{ Tipo: 'Devolución', UnitLineId: ' MSC ', OrderGkey: null }];
    n4.getPendingAppointments.mockResolvedValue(rows);
    n4.getAppointmentsInProgress.mockResolvedValue(rows);
    expect((await fetchAppointments()).data[0].linea).toBe('MSC');
    expect(n4.getOrderInfoByOrderGkeys).not.toHaveBeenCalled();
  });

  it.each([null, '', '   '])('uses N.E. when a return has no unit operator (%s)', async (UnitLineId) => {
    const { fetchAppointments, n4 } = setup();
    const rows = [{ Tipo: 'Devolución', UnitLineId, OrderGkey: 12 }];
    n4.getPendingAppointments.mockResolvedValue(rows);
    n4.getAppointmentsInProgress.mockResolvedValue(rows);
    expect((await fetchAppointments()).data[0].linea).toBe('N.E.');
  });

  it('keeps the booking line for other types even if a unit operator is present', async () => {
    const { fetchAppointments, n4 } = setup();
    const rows = [{ Tipo: 'Recepción Full', UnitLineId: 'UNIT-LINE', OrderGkey: 12 }];
    n4.getPendingAppointments.mockResolvedValue(rows);
    n4.getAppointmentsInProgress.mockResolvedValue(rows);
    expect((await fetchAppointments()).data[0].linea).toBe('BOOKING-LINE');
  });

  it('refreshes legacy cached booking data', async () => {
    const { fetchAppointments, n4, redis } = setup({ booking: 'BOOKING', producto: 'PRODUCT' });
    await fetchAppointments();
    expect(n4.getOrderInfoByOrderGkeys).toHaveBeenCalledWith([12]);
    expect(redis.setJson).toHaveBeenCalledWith(
      CACHE_KEYS.appointmentOrderInfo(12),
      { booking: 'BOOKING', producto: 'PRODUCT', lineId: 'BOOKING-LINE' },
      expect.any(Number),
    );
  });

  it.each(['CACHED-LINE', null])('reuses current cache with line %s', async (lineId) => {
    const { fetchAppointments, n4 } = setup({ booking: 'BOOKING', producto: 'PRODUCT', lineId });
    expect((await fetchAppointments()).data[0].linea).toBe(lineId ?? 'N.E.');
    expect(n4.getOrderInfoByOrderGkeys).not.toHaveBeenCalled();
  });

  it('uses N.E. when the booking has no line', async () => {
    const { fetchAppointments, n4 } = setup();
    n4.getOrderInfoByOrderGkeys.mockResolvedValue([
      { order_gkey: 12, booking: 'BOOKING', commodity: 'PRODUCT', line_id: null },
    ]);
    expect((await fetchAppointments()).data[0].linea).toBe('N.E.');
  });

  it('uses N.E. when the booking does not exist', async () => {
    const { fetchAppointments, n4 } = setup();
    n4.getOrderInfoByOrderGkeys.mockResolvedValue([]);
    expect((await fetchAppointments()).data[0].linea).toBe('N.E.');
  });

  it('uses N.E. for an appointment without an order', async () => {
    const { fetchAppointments, n4 } = setup();
    n4.getAppointmentsInProgress.mockResolvedValue([{ VesselVisitGkey: 34 }]);
    n4.getPendingAppointments.mockResolvedValue([{ VesselVisitGkey: 34 }]);
    expect((await fetchAppointments()).data[0].linea).toBe('N.E.');
    expect(n4.getOrderInfoByOrderGkeys).not.toHaveBeenCalled();
  });
});
