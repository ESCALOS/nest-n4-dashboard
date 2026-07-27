import { TprSummaryRow } from './tpr-report.types';

export const TPR_DETAIL_PAGE_SIZE = 100;

export const TPR_DEFAULT_SUMMARY_ROWS: readonly TprSummaryRow[] = [
  {
    uniqueId: '71010001',
    accountDescription: 'Terminal area (ha)',
    total: 44.62,
    reportType: null,
    hasDetails: false,
  },
  {
    uniqueId: '71010002',
    accountDescription: 'Yard area (ha)',
    total: 41.79,
    reportType: null,
    hasDetails: false,
  },
  {
    uniqueId: '71011003',
    accountDescription: 'Static Capacity Full (TEU)',
    total: 2112,
    reportType: null,
    hasDetails: false,
  },
  {
    uniqueId: '71012003',
    accountDescription: 'Static Capacity Empty (TEU)',
    total: 4716,
    reportType: null,
    hasDetails: false,
  },
  {
    uniqueId: '71010004',
    accountDescription: 'Quay Length (m)',
    total: 700,
    reportType: null,
    hasDetails: false,
  },
  {
    uniqueId: 'DRFTSHLW',
    accountDescription: 'Possible draft at high water (m)',
    total: 13,
    reportType: null,
    hasDetails: false,
  },
  {
    uniqueId: 'DRFTMAXX',
    accountDescription: 'Possible draft at low water (m)',
    total: 10,
    reportType: null,
    hasDetails: false,
  },
  {
    uniqueId: 'RFRPLUGS',
    accountDescription: 'Reefer Plugs',
    total: 1056,
    reportType: null,
    hasDetails: false,
  },
  {
    uniqueId: '71010006',
    accountDescription: 'Maximum Capacity (TEU)',
    total: 11895.3,
    reportType: null,
    hasDetails: false,
  },
];
