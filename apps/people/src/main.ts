import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { PeopleModule } from './people.module';

async function bootstrap() {
  const port = Number(process.env.NARA_PEOPLE_PORT || 4002);
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    PeopleModule,
    {
      transport: Transport.TCP,
      options: { host: '0.0.0.0', port },
    },
  );
  await app.listen();
  console.log(`[nara-people] TCP :${port}`);
}
void bootstrap();
