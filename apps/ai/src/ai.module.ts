import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule, MongoStore } from '@nara/database';
import { AuthCoreModule } from '@nara/auth-core';
import { TeoController } from './teo/teo.controller';
import { TeoAskService } from './teo/ask/teo-ask.service';
import { TeoChatService } from './teo/chat/teo-chat.service';
import { TeoConversationsService } from './teo/conversations/teo-conversations.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthCoreModule,
  ],
  controllers: [TeoController],
  providers: [
    TeoAskService,
    TeoChatService,
    TeoConversationsService,
    MongoStore,
  ],
})
export class AiModule {}
