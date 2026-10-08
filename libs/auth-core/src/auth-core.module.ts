import { Module } from '@nestjs/common';
import { DatabaseModule } from '@nara/database';
import { SessionService } from './session.service';

@Module({
  imports: [DatabaseModule],
  providers: [SessionService],
  exports: [SessionService],
})
export class AuthCoreModule {}
