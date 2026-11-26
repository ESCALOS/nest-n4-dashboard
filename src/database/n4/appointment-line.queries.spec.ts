import { N4Queries } from './n4.queries';

describe.each(['getPendingAppointments', 'getAppointmentsInProgress'] as const)('%s unit line', query => {
  it('resolves the operator from the related unit without requiring a booking', () => {
    const sql = N4Queries[query];
    expect(sql).toContain('unit_line.id AS UnitLineId');
    expect(sql).toMatch(/LEFT JOIN ref_bizunit_scoped unit_line\s+ON unit_line.gkey = unit.line_op/);
    expect(sql).toContain(query === 'getPendingAppointments'
      ? 'ON unit.gkey = appt.unit_gkey'
      : 'ON unit.gkey = gat.unit_gkey');
  });
});
