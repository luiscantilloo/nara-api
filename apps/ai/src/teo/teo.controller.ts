import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Patterns } from '@nara/common';
import { TeoAskService } from './ask/teo-ask.service';
import { TeoChatService } from './chat/teo-chat.service';

@Controller()
export class TeoController {
  constructor(
    private readonly askService: TeoAskService,
    private readonly chatService: TeoChatService,
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
}
