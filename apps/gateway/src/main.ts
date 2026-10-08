import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { GatewayModule } from './gateway.module';

async function bootstrap() {
  const app = await NestFactory.create(GatewayModule);
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || [
      'http://localhost:3002',
      'http://127.0.0.1:3002',
    ],
    credentials: true,
  });
  app.setGlobalPrefix('api');

  const config = app.get(ConfigService);
  const port = Number(
    config.get('PORT') || config.get('NARA_GATEWAY_PORT') || 4000,
  );
  await app.listen(port, '0.0.0.0');
  console.log(`[nara-gateway] HTTP :${port}`);
}
void bootstrap();
