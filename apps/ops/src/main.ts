import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { OpsModule } from './ops.module';

async function bootstrap() {
  const port = Number(process.env.NARA_OPS_PORT || 4003);
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    OpsModule,
    {
      transport: Transport.TCP,
      options: { host: '0.0.0.0', port },
    },
  );
  await app.listen();
  console.log(`[nara-ops] TCP :${port}`);
}
void bootstrap();
