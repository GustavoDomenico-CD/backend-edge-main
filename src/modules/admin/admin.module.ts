import { Module } from '@nestjs/common'
import { AdminAgendamentoController } from './agendamento/admin-agendamento.controller'
import { AdminChatbotService } from './agendamento/admin-chatbot.service'
import { ProactiveAgentService } from './agendamento/proactive-agent.service'
import { PostConsultationWhatsAppService } from './agendamento/post-consultation-whatsapp.service'
import { WhatsAppModule } from '../whatsapp/whatsapp.module'

@Module({
  imports: [WhatsAppModule],
  controllers: [AdminAgendamentoController],
  providers: [AdminChatbotService, ProactiveAgentService, PostConsultationWhatsAppService],
})
export class AdminModule {}

