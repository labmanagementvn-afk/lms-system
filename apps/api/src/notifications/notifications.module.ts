import { Global, Module } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { AlertsService } from './alerts.service';
import { CHANNEL_ADAPTERS, ChannelAdapter } from './channels/channel-adapter';
import { MockChannelAdapter } from './channels/mock-channel.adapter';
import { DispatcherService } from './dispatcher.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * One adapter per outbound channel, from NOTIFY_PROVIDERS ("PUSH=mock,ZALO=mock,SMS=mock,EMAIL=mock").
 * Only the sandbox adapter exists; real FCM / Zalo ZNS / SMS brandname / SMTP adapters plug in here.
 */
export function channelAdaptersFactory(): Map<NotificationChannel, ChannelAdapter> {
  const adapters = new Map<NotificationChannel, ChannelAdapter>();
  const spec = process.env.NOTIFY_PROVIDERS ?? 'PUSH=mock,ZALO=mock,SMS=mock,EMAIL=mock';
  for (const entry of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [channel, provider = 'mock'] = entry.split('=');
    if (!(channel in NotificationChannel) || channel === NotificationChannel.IN_APP) throw new Error(`Unknown notification channel "${channel}"`);
    if (provider !== 'mock') throw new Error(`Provider "${provider}" for ${channel} is not implemented; see docs/notifications.md`);
    adapters.set(channel as NotificationChannel, new MockChannelAdapter(channel as NotificationChannel));
  }
  return adapters;
}

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, DispatcherService, AlertsService, { provide: CHANNEL_ADAPTERS, useFactory: channelAdaptersFactory }],
  exports: [NotificationsService, DispatcherService, AlertsService],
})
export class NotificationsModule {}
