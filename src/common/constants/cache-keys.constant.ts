/**
 * Redis cache key patterns
 */
export const CACHE_KEYS = {
  manifest: (manifestId: string) => `manifest:${manifestId}`,
  // Monitoring General Cargo keys
  vesselOperations: (manifestId: string, operationType: string) => `monitoring:general-cargo:operation-vessel:${manifestId}:${operationType}`,

  holds: (vvdGkey: number) => `monitoring:general-cargo:holds:${vvdGkey}`,
  blItems: (cvGkey: number, isAs: boolean) =>
    `monitoring:general-cargo:blitems:${cvGkey}:${isAs ? 'AS' : 'NAS'}`,
  transactions: (manifestId: string, operationType: string) =>
    `monitoring:general-cargo:transactions:${manifestId}:${operationType}`,
  holdAlerts: (manifestId: string, operationType: string) =>
    `monitoring:general-cargo:hold-alerts:${manifestId}:${operationType}`,

  // Active monitored operations (manifest:operationType pairs) for background job
  monitoredOperations: 'monitoring:general-cargo:monitored-operations',

  // Container monitoring keys
  containerMonitoredVessels: 'monitoring:containers:monitored-vessels',
  containerData: (manifestId: string) =>
    `monitoring:containers:data:${manifestId}`,
  containerPlannedPositions: (manifestId: string) =>
    `monitoring:containers:planned-positions:${manifestId}`,

  // Appointments module keys
  appointmentsInProgress: 'appointments:in-progress',
  pendingAppointments: 'appointments:pending',
  appointmentVesselByCarrierVisit: (carrierVisitGkey: number) =>
    `appointments:vessel-by-carrier-visit:${carrierVisitGkey}`,
  appointmentOrderInfo: (orderGkey: number) =>
    `appointments:order-info:${orderGkey}`,
  appointmentStages: (tranGkey: number | string) =>
    `appointments:stages:${tranGkey}`,
};

/**
 * Cache TTL values (in seconds)
 * Note: Most data has no expiry and is invalidated manually
 */
export const CACHE_TTL = {
  // Transactions are refreshed by background job every 15s
  // No TTL needed as job handles refresh
  transactions: undefined,

  // Appointments are refreshed by background job every 5s
  // No TTL needed as job handles refresh
  appointments: undefined,

  // Booking/commodity metadata for pending appointments
  // Appointments are usually created up to 3 days in advance
  appointmentOrderInfo: 3 * 24 * 60 * 60,

  // Stage timestamps are immutable once stage is completed.
  // Keep them warm for a few hours to reduce repeated stage aggregation queries.
  appointmentStages: 6 * 60 * 60,
};
