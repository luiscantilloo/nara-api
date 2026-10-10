import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { securityHeaders } from './security-headers';
import { GatewayModule } from './gateway.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(GatewayModule);
  // H-008: sin X-Powered-By y con cabeceras básicas de seguridad (la API solo responde JSON).
  app.disable('x-powered-by');
  app.use(securityHeaders);
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
