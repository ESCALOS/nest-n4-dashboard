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

  // Appointments module keys
  appointmentsInProgress: 'appointments:in-progress',
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
};
