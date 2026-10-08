import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AiModule } from './ai.module';

async function bootstrap() {
  const port = Number(process.env.NARA_AI_PORT || 4004);
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AiModule,
    {
      transport: Transport.TCP,
      options: { host: '0.0.0.0', port },
    },
  );
  await app.listen();
  console.log(`[nara-ai] TCP :${port}`);
}
void bootstrap();
