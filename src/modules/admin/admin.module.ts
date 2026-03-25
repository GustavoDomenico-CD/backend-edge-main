import { Module } from '@nestjs/common'
import { AdminAgendamentoController } from './agendamento/admin-agendamento.controller'
import { AdminChatbotService } from './agendamento/admin-chatbot.service'

@Module({
  controllers: [AdminAgendamentoController],
  providers: [AdminChatbotService],
})
export class AdminModule {}

