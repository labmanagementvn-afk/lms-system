import { Controller, Get, Header, HttpCode, Logger, Post, Query, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { Public } from '../common/decorators';
import { tzOffsetMinutes } from '../common/time';
import { parseZktecoAttlog } from './adapters/zkteco';
import { DevicesService } from './devices.service';
import { IngestService } from './ingest.service';

/**
 * ZKTeco ADMS ("PUSH") endpoint. Point the terminal's Cloud Server / ADMS
 * setting at this API's host and port; it is served outside the /api prefix
 * at /iclock/*. Devices are identified by serial number (register it first).
 */
// Terminals push every scan from one address: never rate-limited.
@SkipThrottle()
@ApiExcludeController()
@Public()
@Controller('iclock')
export class ZktecoController {
  private readonly logger = new Logger(ZktecoController.name);

  constructor(
    private readonly devices: DevicesService,
    private readonly ingest: IngestService,
  ) {}

  @Get('cdata')
  @Header('Content-Type', 'text/plain')
  async handshake(@Query('SN') sn: string) {
    const device = await this.devices.authenticateSerial(sn);
    return [
      `GET OPTION FROM: ${sn}`,
      'ATTLOGStamp=None',
      'OPERLOGStamp=9999',
      'ATTPHOTOStamp=None',
      'ErrorDelay=30',
      'Delay=10',
      'TransTimes=00:00;14:05',
      'TransInterval=1',
      'TransFlag=TransData AttLog',
      // Informational for the device; uploaded times are converted with the school timezone.
      `TimeZone=${Math.round(tzOffsetMinutes(new Date(), device.school.timezone) / 60)}`,
      'Realtime=1',
      'Encrypt=None',
    ].join('\n');
  }

  @Post('cdata')
  @HttpCode(200)
  @Header('Content-Type', 'text/plain')
  async upload(@Query('SN') sn: string, @Query('table') table: string, @Req() req: Request) {
    const device = await this.devices.authenticateSerial(sn);
    if (table !== 'ATTLOG') return 'OK';
    const body = typeof req.body === 'string' ? req.body : '';
    const events = parseZktecoAttlog(body, device.school.timezone);
    const result = await this.ingest.ingest(device, events);
    if (result.rejected) this.logger.warn(`Device ${sn}: ${result.rejected} events rejected`);
    return `OK: ${events.length}`;
  }

  @Get('getrequest')
  @Header('Content-Type', 'text/plain')
  async getRequest(@Query('SN') sn: string) {
    await this.devices.authenticateSerial(sn);
    return 'OK';
  }

  @Post('devicecmd')
  @HttpCode(200)
  @Header('Content-Type', 'text/plain')
  deviceCmd() {
    return 'OK';
  }
}
