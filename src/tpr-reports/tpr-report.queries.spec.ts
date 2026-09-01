import { TprReportQueries } from './tpr-report.queries';

describe('TprReportQueries', () => {
  it('counts each Fetch, Carry and Put equipment participation within the month', () => {
    expect(TprReportQueries.equipmentSummary.match(/UNION ALL/g)).toHaveLength(
      2,
    );
    expect(TprReportQueries.equipmentSummary).toContain('mov.che_fetch');
    expect(TprReportQueries.equipmentSummary).toContain('mov.che_carry');
    expect(TprReportQueries.equipmentSummary).toContain('mov.che_put');
    expect(TprReportQueries.equipmentSummary).toContain(
      'mov.t_put>=@fecha_inicio',
    );
    expect(TprReportQueries.equipmentSummary).toContain('mov.t_put<@fecha_fin');
    expect(TprReportQueries.equipmentSummary).toContain(
      "('81013063','Performance Equipment SC Total Moves')",
    );
  });

  it('uses the closed equipment catalogue and supports ownership filtering', () => {
    expect(TprReportQueries.equipmentDetails).toContain(
      "('81013073','Performance Equipment RST Total Moves','RS06','RENTED')",
    );
    expect(TprReportQueries.equipmentDetails).toContain(
      "('81013073','Performance Equipment RST Total Moves','RS12','RENTED')",
    );
    expect(TprReportQueries.equipmentDetails).toContain(
      "(@ownership='ALL' OR cem.ownership=@ownership)",
    );
  });
  it('does not expose Shifter topics or queries', () => {
    expect(TprReportQueries.containerSummary).not.toContain('5X114');
    expect(TprReportQueries.containerSummary).not.toContain('srv_event');
    expect('shifterDetails' in TprReportQueries).toBe(false);
  });

  it('resolves movement and truck lines from inv_unit instead of the visit', () => {
    expect(TprReportQueries.containerDetails).toContain(
      'LEFT JOIN ref_bizunit_scoped line ON line.gkey = iu.line_op',
    );
    expect(TprReportQueries.truckDetails).toContain('iu.line_op');
    expect(TprReportQueries.truckDetails).toContain(
      'LEFT JOIN ref_bizunit_scoped line ON line.gkey=tn.line_op',
    );
    expect(TprReportQueries.containerDetails).not.toContain(
      'line.gkey = acv.operator_gkey',
    );
    expect(TprReportQueries.truckDetails).not.toContain(
      'line.gkey=acv.operator_gkey',
    );
  });

  it('counts closed container vessel calls using the requested period', () => {
    expect(TprReportQueries.containerSummary).toContain(
      "'5X101000BDUMSDUM' AS unique_id",
    );
    expect(TprReportQueries.containerSummary).toContain(
      "vessel_visit.flex_string01='CONT'",
    );
    expect(TprReportQueries.containerSummary).toContain(
      "acv.phase IN ('60DEPARTED','70CLOSED')",
    );
    expect(TprReportQueries.containerSummary).toContain(
      'acv.atd>=@fecha_inicio',
    );
    expect(TprReportQueries.containerSummary).toContain('acv.atd<@fecha_fin');
  });

  it('returns a paginated Vessel calls detail with ATD, manifest and vessel', () => {
    expect(TprReportQueries.vesselCallsDetails).toContain('acv.atd');
    expect(TprReportQueries.vesselCallsDetails).toContain('acv.id AS manifest');
    expect(TprReportQueries.vesselCallsDetails).toContain(
      'vessel.name AS vessel',
    );
    expect(TprReportQueries.vesselCallsDetails).toContain(
      'ORDER BY acv.atd,acv.gkey',
    );
  });
});
