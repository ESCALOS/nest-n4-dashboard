/**
 * Redis cache key patterns
 */
export const CACHE_KEYS = {
  // Shipping module keys
  manifest: (manifestId: string) => `shipping:manifest:${manifestId}`,
  bodegas: (vvdGkey: number) => `shipping:bodegas:${vvdGkey}`,
  blItems: (cvGkey: number, pattern: 'SSP' | 'OS') =>
    `shipping:blitems:${cvGkey}:${pattern}`,
  transactions: (manifestId: string, operationType: string) =>
    `shipping:transactions:${manifestId}:${operationType}`,

  // Active manifests tracking
  activeManifests: 'shipping:active-manifests',

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
