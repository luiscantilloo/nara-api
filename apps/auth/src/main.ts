import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AuthModule } from './auth.module';

async function bootstrap() {
  const port = Number(process.env.NARA_AUTH_PORT || 4001);
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AuthModule,
    {
      transport: Transport.TCP,
      options: { host: '0.0.0.0', port },
    },
  );
  await app.listen();
  console.log(`[nara-auth] TCP :${port}`);
}
void bootstrap();
