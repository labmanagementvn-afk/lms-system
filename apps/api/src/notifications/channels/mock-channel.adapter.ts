import { Logger } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { ChannelAdapter, OutboundMessage } from './channel-adapter';

/**
 * Sandbox channel: logs the message and returns a fake provider reference.
 * A body containing "[mock-fail]" fails, to exercise retries.
 */
export class MockChannelAdapter implements ChannelAdapter {
  private readonly logger = new Logger('MockChannel');
  readonly name: string;
  readonly sent: OutboundMessage[] = [];

  constructor(readonly channel: NotificationChannel) {
    this.name = `mock-${channel.toLowerCase()}`;
  }

  async send(message: OutboundMessage): Promise<{ externalRef: string }> {
    if (message.body.includes('[mock-fail]')) throw new Error(`${this.name}: simulated failure`);
    this.sent.push(message);
    this.logger.debug(`${this.channel} -> ${message.to.join(',')}: ${message.title}`);
    return { externalRef: `${this.name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` };
  }
}
