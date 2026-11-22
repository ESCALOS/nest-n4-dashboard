import { N4Queries } from './n4.queries';

describe('booking export query', () => {
  const query = N4Queries.getContainerBookingExport;

  it('includes dispatch appointments while retaining reception priority and excluding cancellations', () => {
    expect(query).toContain("appt.trans_type IN ('DOE', 'PUM')");
    expect(query).toContain("appt.state <> 'CANCEL'");
    expect(query).toContain('appt.order_gkey = booking.gkey');
    expect(query).toContain('appt.gate_gkey = 53');
    expect(query).toContain("CASE WHEN appt.trans_type = 'DOE' THEN 0 ELSE 1 END");
  });

  it('selects the latest unit per container within the order instead of duplicating historical units', () => {
    expect(query).toMatch(
      /ROW_NUMBER\(\) OVER\s*\(\s*PARTITION BY candidate\.id\s*ORDER BY candidate\.gkey DESC\s*\)/,
    );
    expect(query).toContain(
      'candidate.depart_order_item_gkey = order_item.base_item_gkey',
    );
    expect(query).toContain('WHERE ranked_unit.booking_unit_rank = 1');
    expect(query).toContain('OUTER APPLY');
    expect(query).not.toContain('SELECT DISTINCT');
  });
});
