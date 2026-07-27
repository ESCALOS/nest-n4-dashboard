import { TprReportQueries } from './tpr-report.queries';

describe('TprReportQueries', () => {
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
});
