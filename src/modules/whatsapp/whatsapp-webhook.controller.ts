import { Body, Controller, ForbiddenException, Get, Post, Query } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';

@Controller('webhook/whatsapp')
export class WhatsAppWebhookController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? 'whatsapp_verify_token';
    if (mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }
    throw new ForbiddenException('Invalid verify token');
  }

  @Post()
  async handleWebhook(@Body() body: Record<string, unknown>) {
    try {
      const entry = (body.entry as Array<Record<string, unknown>>)?.[0];
      const changes = (entry?.changes as Array<Record<string, unknown>>)?.[0];
      const value = changes?.value as Record<string, unknown>;

      if (!value) return { status: 'ok' };

      // Handle incoming messages
      const messages = value.messages as Array<Record<string, unknown>> | undefined;
      if (messages?.length) {
        for (const msg of messages) {
          const from = msg.from as string;
          const messageId = msg.id as string;
          const type = (msg.type as string) ?? 'text';
          let content = '';
          let mediaUrl: string | undefined;

          if (type === 'text') {
            content = (msg.text as Record<string, string>)?.body ?? '';
          } else if (['image', 'video', 'audio', 'document'].includes(type)) {
            const media = msg[type] as Record<string, string>;
            content = media?.caption ?? '';
            mediaUrl = media?.id;
          }

          await this.whatsappService.handleInboundMessage(from, messageId, type, content, mediaUrl);
        }
      }

      // Handle status updates
      const statuses = value.statuses as Array<Record<string, unknown>> | undefined;
      if (statuses?.length) {
        for (const st of statuses) {
          await this.whatsappService.handleStatusUpdate(
            st.id as string,
            st.status as string,
          );
        }
      }

      return { status: 'ok' };
    } catch (error) {
      console.error('[WhatsApp Webhook] Error:', error);
      return { status: 'ok' };
    }
  }
}
