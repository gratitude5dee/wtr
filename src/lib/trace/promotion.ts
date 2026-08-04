/**
 * Which asset events are mirrored into Trace.
 *
 * Trace allows at most {@link MAX_TRACE_UPDATES_PER_DATA_ID} metadata updates
 * per `data_id`, so only the goal.md subset is promoted: consent change, KYC
 * change, license change, takedown, and `payment_credited_at`. Everything else
 * stays in WTR's own event log.
 */
import { EVENT, type EventType } from "../pipeline/types";

export const PROMOTABLE_EVENTS: ReadonlySet<EventType> = new Set<EventType>([
  EVENT.CONSENT_CHANGED,
  EVENT.KYC_CHANGED,
  EVENT.LICENSE_CHANGED,
  EVENT.TAKEDOWN,
  EVENT.PAYOUT_CREDITED, // carries payment_credited_at
]);

export function isPromotable(eventType: EventType): boolean {
  return PROMOTABLE_EVENTS.has(eventType);
}
