import { AppointmentsController } from './appointments.controller';
describe('Appointment line access', () => {
  const setup = (isInternal: boolean, allowedLines: string[]) => {
    const user = { isActive: true, isInternal, allowedLines };
    const response = {
      data: [
        { cita: '1', linea: 'CMA' },
        { cita: '2', linea: 'MSC' },
        { cita: '3', linea: 'N.E.' },
      ],
      count: 3,
    };
    const service = {
      getAppointmentsInProgress: jest.fn().mockResolvedValue(response),
      getPendingAppointments: jest.fn().mockResolvedValue(response),
      getEirPrintData: jest.fn(),
    };
    const controller = new AppointmentsController(
      { user: { findUnique: jest.fn().mockResolvedValue(user) } } as any,
      service as any,
      {} as any,
    );
    return { controller, service, response, user };
  };
  it('filters both lists without changing the shared response', async () => {
    const { controller, response } = setup(false, ['CMA']);
    for (const method of [
      'getAppointmentsInProgress',
      'getPendingAppointments',
    ] as const) {
      expect(await controller[method]({ user: { userId: 'u' } })).toEqual({
        data: [response.data[0]],
        count: 1,
      });
    }
    expect(response.count).toBe(3);
    expect(response.data).toHaveLength(3);
  });
  it('allows all lines for internal users and none for an empty external scope', async () => {
    expect(
      (
        await setup(true, []).controller.getPendingAppointments({
          user: { userId: 'u' },
        })
      ).count,
    ).toBe(3);
    expect(
      (
        await setup(false, []).controller.getPendingAppointments({
          user: { userId: 'u' },
        })
      ).count,
    ).toBe(0);
  });
  it('rejects EIR access to another line before fetching details', async () => {
    const { controller, service } = setup(false, ['CMA']);
    await expect(
      controller.getEirPrintData(
        { user: { userId: 'u' } },
        { appointmentId: '2' },
      ),
    ).rejects.toThrow();
    expect(service.getEirPrintData).not.toHaveBeenCalled();
  });
});
