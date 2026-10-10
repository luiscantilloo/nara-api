import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Patterns } from '@nara/common';
import { TeoAskService } from './ask/teo-ask.service';
import { TeoChatService } from './chat/teo-chat.service';
import { TeoConversationsService } from './conversations/teo-conversations.service';

@Controller()
export class TeoController {
  constructor(
    private readonly askService: TeoAskService,
    private readonly chatService: TeoChatService,
    private readonly conversationsService: TeoConversationsService,
  ) {}

  @MessagePattern(Patterns.TEO_ASK)
  ask(
    @Payload()
    data: {
      token: string | null;
      question?: string;
      text?: string;
      role?: string;
    },
  ) {
    return this.askService.ask(data);
  }

  @MessagePattern(Patterns.TEO_CHAT)
  chat(
    @Payload()
    data: {
      token: string | null;
      message?: string;
      history?: string;
      patientName?: string;
      place?: string;
      profile?: string;
      age?: number | string;
      messages?: unknown[];
      system?: string;
    },
  ) {
    return this.chatService.chat(data);
  }

  @MessagePattern(Patterns.TEO_CONVERSATIONS_LIST)
  listConversations(
    @Payload()
    data: {
      token: string | null;
      patientId?: string;
      patientName?: string;
    },
  ) {
    return this.conversationsService.list(data);
  }

  @MessagePattern(Patterns.TEO_CONVERSATIONS_UPSERT)
  upsertConversation(
    @Payload()
    data: { token: string | null; body: Record<string, unknown> },
  ) {
    return this.conversationsService.upsert(data);
  }
}
