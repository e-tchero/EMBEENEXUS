/**
 * EventPublisher port — the transactional-outbox seam.
 *
 * Each command writes its state change, its audit row and its outbox row in one
 * transaction; external effects (gateway, SMS, push, socket) happen only after
 * that commit, driven by the outbox. The domain therefore depends on this
 * interface and never on a broker or an HTTP client.
 *
 * This module contains no framework, database, or vendor imports.
 */

export interface DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly eventId: string;
  readonly type: string;
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly payload: TPayload;
}

/**
 * Enqueue one or more domain events for delivery. Implementations must be
 * idempotent: consumers are at-least-once, so duplicate delivery is expected
 * and de-duplicated downstream on `eventId`.
 */
export interface EventPublisher {
  publish(events: readonly DomainEvent[]): Promise<void>;
}
