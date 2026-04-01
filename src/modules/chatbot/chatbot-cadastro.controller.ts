import { Body, Controller, Post } from '@nestjs/common';
import { ChatbotCadastroService } from './chatbot-cadastro.service';
import { ChatbotCadastroDto } from './dto/chatbot-cadastro.dto';

/** Cadastro público originado no chatbot (corpo JSON pequeno). */
@Controller('chatbot')
export class ChatbotCadastroController {
  constructor(private readonly chatbotCadastro: ChatbotCadastroService) {}

  @Post('cadastro')
  async cadastro(@Body() dto: ChatbotCadastroDto) {
    const data = await this.chatbotCadastro.registerViaChatbot(dto);
    return { status: 'sucesso', ...data };
  }
}
