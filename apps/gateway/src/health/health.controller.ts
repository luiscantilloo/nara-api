import { Controller, Get } from '@nestjs/common';
import { Patterns } from '@nara/common';
import { ProxyService } from '../proxy/proxy.service';

@Controller()
export class HealthController {
  constructor(private readonly proxy: ProxyService) {}

  @Get('health')
  health() {
    return { ok: true, service: 'nara-gateway' };
  }

  @Get('health/db')
  async healthDb() {
    try {
      return await this.proxy.send('ops', Patterns.HEALTH_DB, {});
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'ops offline',
      };
    }
  }
}
