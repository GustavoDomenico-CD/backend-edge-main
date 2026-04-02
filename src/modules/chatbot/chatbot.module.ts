import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { ChatbotCadastroService } from './chatbot-cadastro.service';
import { ChatbotCadastroController } from './chatbot-cadastro.controller';
import { AdminChatbotCadastroController } from './admin-chatbot-cadastro.controller';

@Module({
  imports: [PrismaModule, AuthModule, WhatsAppModule],
  controllers: [ChatbotCadastroController, AdminChatbotCadastroController],
  providers: [ChatbotCadastroService],
})
export class ChatbotModule {}
