import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { ChatbotCadastroDto } from './dto/chatbot-cadastro.dto';

@Injectable()
export class ChatbotCadastroService {
  private readonly logger = new Logger(ChatbotCadastroService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  async registerViaChatbot(dto: ChatbotCadastroDto) {
    const email = dto.email.trim().toLowerCase();
    const failRow = async (message: string) => {
      try {
        await this.prisma.chatbotCadastro.create({
          data: {
            email,
            name: dto.name?.trim(),
            phone: dto.phone?.trim(),
            consultationType: dto.consultationType?.trim(),
            consultationCategory: dto.consultationCategory?.trim(),
            role: 'paciente',
            status: 'failed',
            errorMessage: message.slice(0, 2000),
          },
        });
      } catch (e) {
        this.logger.warn(`Falha ao registrar linha de auditoria: ${e}`);
      }
    };

    try {
      const reg = await this.authService.register({
        email,
        password: dto.password,
        name: dto.name?.trim() || undefined,
        phone: dto.phone?.trim() || undefined,
        role: 'paciente',
      });

      try {
        await this.prisma.chatbotCadastro.create({
          data: {
            email,
            name: dto.name?.trim(),
            phone: dto.phone?.trim(),
            consultationType: dto.consultationType?.trim(),
            consultationCategory: dto.consultationCategory?.trim(),
            role: 'paciente',
            userId: reg.user.id,
            status: 'completed',
          },
        });
      } catch (err) {
        this.logger.error(`ChatbotCadastro create após User: ${err}`);
      }

      await this.syncWhatsAppContactFromCadastro(dto);

      return { success: true, user: reg.user };
    } catch (e) {
      if (e instanceof ConflictException) {
        await failRow('E-mail já cadastrado');
        throw new ConflictException('E-mail já cadastrado');
      }
      const msg = e instanceof Error ? e.message : 'Erro ao cadastrar';
      await failRow(msg);
      throw e;
    }
  }

  /**
   * Mesmo efeito de POST /admin/whatsapp/contacts: cria ou atualiza contato com telefone e nome.
   * Telefone só dígitos + prefixo 55 quando aplicável (via WhatsAppService.upsertContact).
   * Falha aqui não interrompe o cadastro (apenas warning no log).
   */
  private async syncWhatsAppContactFromCadastro(dto: ChatbotCadastroDto) {
    const raw = dto.phone?.trim();
    if (!raw || !/\d/.test(raw)) return;
    const name = dto.name?.trim() || 'Paciente';
    try {
      await this.whatsapp.upsertContact({
        phoneNumber: raw,
        name,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Sincronização WhatsApp após cadastro chatbot não realizada: ${msg}`);
    }
  }

  async listRecent(take: number) {
    const rows = await this.prisma.chatbotCadastro.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(take, 1), 500),
      include: {
        user: {
          select: { id: true, email: true, role: true, name: true },
        },
      },
    });
    return rows;
  }
}
