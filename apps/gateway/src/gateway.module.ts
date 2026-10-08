import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ServicePorts } from '@nara/common';
import { AuthProxyController } from './auth/auth.proxy';
import { PeopleProxyController } from './people/people.proxy';
import { OpsProxyController } from './ops/ops.proxy';
import { AiProxyController } from './ai/ai.proxy';
import { HealthController } from './health/health.controller';
import { ProxyService } from './proxy/proxy.service';

const host = process.env.NARA_MS_HOST || '127.0.0.1';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClientsModule.register([
      {
        name: 'AUTH_SERVICE',
        transport: Transport.TCP,
        options: { host, port: ServicePorts.auth },
      },
      {
        name: 'PEOPLE_SERVICE',
        transport: Transport.TCP,
        options: { host, port: ServicePorts.people },
      },
      {
        name: 'OPS_SERVICE',
        transport: Transport.TCP,
        options: { host, port: ServicePorts.ops },
      },
      {
        name: 'AI_SERVICE',
        transport: Transport.TCP,
        options: { host, port: ServicePorts.ai },
      },
    ]),
  ],
  controllers: [
    HealthController,
    AuthProxyController,
    PeopleProxyController,
    OpsProxyController,
    AiProxyController,
  ],
  providers: [ProxyService],
})
export class GatewayModule {}
