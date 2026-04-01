import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { ChatbotCadastroService } from './chatbot-cadastro.service';

@Controller('admin/chatbot-cadastros')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin', 'superadmin')
export class AdminChatbotCadastroController {
  constructor(private readonly chatbotCadastro: ChatbotCadastroService) {}

  @Get()
  async list(@Query('limit') limit?: string) {
    const take = Number(limit) || 100;
    const data = await this.chatbotCadastro.listRecent(take);
    return { status: 'sucesso', data };
  }
}
