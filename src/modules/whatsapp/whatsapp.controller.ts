import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { WhatsAppService } from './whatsapp.service';
import {
  CreateWhatsAppConfigDto,
  UpdateWhatsAppConfigDto,
  SendTextMessageDto,
  SendTemplateMessageDto,
  SendMediaMessageDto,
  UpsertContactDto,
  CreateTemplateDto,
  UpdateTemplateDto,
} from './dto/whatsapp.dto';

@Controller('admin/whatsapp')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  // ─── Config ─────────────────────────────────────────────

  @Get('config')
  async getConfigs() {
    const data = await this.whatsappService.getAllConfigs();
    return { status: 'sucesso', data };
  }

  @Post('config')
  async createConfig(@Body() dto: CreateWhatsAppConfigDto) {
    const data = await this.whatsappService.createConfig(dto);
    return { status: 'sucesso', data, mensagem: 'Configuração criada com sucesso' };
  }

  @Put('config/:id')
  async updateConfig(@Param('id') id: string, @Body() dto: UpdateWhatsAppConfigDto) {
    const data = await this.whatsappService.updateConfig(Number(id), dto);
    return { status: 'sucesso', data, mensagem: 'Configuração atualizada' };
  }

  @Delete('config/:id')
  async deleteConfig(@Param('id') id: string) {
    await this.whatsappService.deleteConfig(Number(id));
    return { status: 'sucesso', mensagem: 'Configuração removida' };
  }

  @Get('status')
  async getConnectionStatus() {
    const data = await this.whatsappService.getConnectionStatus();
    return { status: 'sucesso', data };
  }

  @Post('connect')
  async connect() {
    const data = await this.whatsappService.connectActive(false);
    return { status: 'sucesso', data, mensagem: 'Conexão iniciada (se necessário, escaneie o QR code).' };
  }

  @Post('disconnect')
  async disconnect() {
    const data = await this.whatsappService.disconnectActive(false);
    return { status: 'sucesso', data, mensagem: 'WhatsApp desconectado.' };
  }

  @Post('reset-session')
  async resetSession() {
    const data = await this.whatsappService.resetActiveSession();
    return { status: 'sucesso', data, mensagem: 'Sessão resetada. Será necessário parear novamente.' };
  }

  // ─── Messages ───────────────────────────────────────────

  @Post('messages/send-text')
  async sendText(@Body() dto: SendTextMessageDto) {
    const data = await this.whatsappService.sendTextMessage(dto);
    return { status: 'sucesso', data, mensagem: 'Mensagem enviada' };
  }

  @Post('messages/send-template')
  async sendTemplate(@Body() dto: SendTemplateMessageDto) {
    const data = await this.whatsappService.sendTemplateMessage(dto);
    return { status: 'sucesso', data, mensagem: 'Template enviado' };
  }

  @Post('messages/send-media')
  async sendMedia(@Body() dto: SendMediaMessageDto) {
    const data = await this.whatsappService.sendMediaMessage(dto);
    return { status: 'sucesso', data, mensagem: 'Mídia enviada' };
  }

  @Get('messages')
  async listMessages(
    @Query('contactId') contactId?: string,
    @Query('direction') direction?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page = '1',
    @Query('per_page') perPage = '20',
  ) {
    const data = await this.whatsappService.listMessages({
      contactId: contactId ? Number(contactId) : undefined,
      direction,
      status,
      startDate,
      endDate,
      page: Number(page),
      perPage: Number(perPage),
    });
    return { status: 'sucesso', ...data };
  }

  // ─── Contacts ───────────────────────────────────────────

  @Get('contacts')
  async listContacts(
    @Query('page') page = '1',
    @Query('per_page') perPage = '20',
  ) {
    const data = await this.whatsappService.listContacts(Number(page), Number(perPage));
    return { status: 'sucesso', ...data };
  }

  @Post('contacts')
  async upsertContact(@Body() dto: UpsertContactDto) {
    const data = await this.whatsappService.upsertContact(dto);
    return { status: 'sucesso', data, mensagem: 'Contato salvo' };
  }

  @Delete('contacts/:id')
  async deleteContact(@Param('id') id: string) {
    await this.whatsappService.deleteContact(Number(id));
    return { status: 'sucesso', mensagem: 'Contato removido' };
  }

  @Patch('contacts/:id/toggle-block')
  async toggleBlock(@Param('id') id: string) {
    const data = await this.whatsappService.toggleBlockContact(Number(id));
    return { status: 'sucesso', data };
  }

  // ─── Templates ──────────────────────────────────────────

  @Get('templates')
  async listTemplates() {
    const data = await this.whatsappService.listTemplates();
    return { status: 'sucesso', data };
  }

  @Post('templates')
  async createTemplate(@Body() dto: CreateTemplateDto) {
    const data = await this.whatsappService.createTemplate(dto);
    return { status: 'sucesso', data, mensagem: 'Template criado' };
  }

  @Put('templates/:id')
  async updateTemplate(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    const data = await this.whatsappService.updateTemplate(Number(id), dto);
    return { status: 'sucesso', data, mensagem: 'Template atualizado' };
  }

  @Delete('templates/:id')
  async deleteTemplate(@Param('id') id: string) {
    await this.whatsappService.deleteTemplate(Number(id));
    return { status: 'sucesso', mensagem: 'Template removido' };
  }

  // ─── KPIs ──────────────────────────────────────────────

  @Get('kpis')
  async getKPIs() {
    const data = await this.whatsappService.getKPIs();
    return { status: 'sucesso', data };
  }

  // ─── Webhook (public - no auth) ────────────────────────
  // Note: Webhook endpoints are handled separately without auth
}
