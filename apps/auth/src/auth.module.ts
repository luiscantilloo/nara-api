import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@nara/database';
import { AuthCoreModule } from '@nara/auth-core';
import { LoginController } from './login/login.controller';
import { LoginService } from './login/login.service';
import { SessionController } from './session/session.controller';
import { SessionQueryService } from './session/session.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthCoreModule,
  ],
  controllers: [LoginController, SessionController],
  providers: [LoginService, SessionQueryService],
})
export class AuthModule {}
