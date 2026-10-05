import { NotificationChannel } from '@prisma/client';

export const CHANNEL_ADAPTERS = Symbol('CHANNEL_ADAPTERS');

export interface OutboundMessage {
  /** Phone (ZALO, SMS), email (EMAIL) or device tokens (PUSH), depending on the channel. */
  to: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** One delivery channel: FCM/APNs push, Zalo ZNS, SMS brandname, email... */
export interface ChannelAdapter {
  readonly channel: NotificationChannel;
  readonly name: string;
  send(message: OutboundMessage): Promise<{ externalRef: string }>;
}
