import { Direction, EventMethod } from '@prisma/client';

/** A gate event in the shape every terminal adapter produces. */
export interface NormalizedEvent {
  /** Unique per device; retries with the same id are ignored. */
  externalEventId: string;
  /** Person ID stored on the terminal, or the card number / QR payload. */
  personId: string;
  method: EventMethod;
  direction: Direction;
  occurredAt: Date;
  raw?: unknown;
}
