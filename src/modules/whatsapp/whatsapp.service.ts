import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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

@Injectable()
export class WhatsAppService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Config ─────────────────────────────────────────────

  async getConfig() {
    return this.prisma.whatsAppConfig.findFirst({ where: { isActive: true } });
  }

  async getAllConfigs() {
    return this.prisma.whatsAppConfig.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createConfig(dto: CreateWhatsAppConfigDto) {
    return this.prisma.whatsAppConfig.create({
      data: {
        instanceName: dto.instanceName,
        phoneNumber: dto.phoneNumber,
        apiKey: dto.apiKey,
        webhookUrl: dto.webhookUrl ?? '',
        status: 'disconnected',
        isActive: true,
      },
    });
  }

  async updateConfig(id: number, dto: UpdateWhatsAppConfigDto) {
    const config = await this.prisma.whatsAppConfig.findUnique({ where: { id } });
    if (!config) throw new NotFoundException('Configuração não encontrada');
    return this.prisma.whatsAppConfig.update({ where: { id }, data: dto });
  }

  async deleteConfig(id: number) {
    const config = await this.prisma.whatsAppConfig.findUnique({ where: { id } });
    if (!config) throw new NotFoundException('Configuração não encontrada');
    return this.prisma.whatsAppConfig.delete({ where: { id } });
  }

  async getConnectionStatus() {
    const config = await this.getConfig();
    return {
      connected: config?.status === 'connected',
      status: config?.status ?? 'disconnected',
      phoneNumber: config?.phoneNumber ?? null,
      instanceName: config?.instanceName ?? null,
    };
  }

  // ─── Messages ───────────────────────────────────────────

  async sendTextMessage(dto: SendTextMessageDto) {
    const contact = await this.findOrCreateContact(dto.to);
    const message = await this.prisma.whatsAppMessage.create({
      data: {
        contactId: contact.id,
        direction: 'outbound',
        type: 'text',
        content: dto.text,
        status: 'pending',
        sentAt: new Date(),
      },
    });

    // Simulate sending (in production, this calls the WhatsApp Cloud API)
    await this.prisma.whatsAppMessage.update({
      where: { id: message.id },
      data: {
        status: 'sent',
        externalId: `wamid.${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
      },
    });

    return { success: true, messageId: message.id };
  }

  async sendTemplateMessage(dto: SendTemplateMessageDto) {
    const contact = await this.findOrCreateContact(dto.to);
    const content = dto.variables?.length
      ? `[Template: ${dto.templateName}] vars: ${dto.variables.join(', ')}`
      : `[Template: ${dto.templateName}]`;

    const message = await this.prisma.whatsAppMessage.create({
      data: {
        contactId: contact.id,
        direction: 'outbound',
        type: 'template',
        content,
        status: 'sent',
        templateName: dto.templateName,
        sentAt: new Date(),
        externalId: `wamid.${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
      },
    });

    return { success: true, messageId: message.id };
  }

  async sendMediaMessage(dto: SendMediaMessageDto) {
    const contact = await this.findOrCreateContact(dto.to);
    const message = await this.prisma.whatsAppMessage.create({
      data: {
        contactId: contact.id,
        direction: 'outbound',
        type: dto.type,
        content: dto.caption ?? '',
        mediaUrl: dto.mediaUrl,
        status: 'sent',
        sentAt: new Date(),
        externalId: `wamid.${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
      },
    });

    return { success: true, messageId: message.id };
  }

  async listMessages(filters: {
    contactId?: number;
    direction?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    perPage?: number;
  }) {
    const where: Record<string, unknown> = {};
    if (filters.contactId) where.contactId = filters.contactId;
    if (filters.direction) where.direction = filters.direction;
    if (filters.status) where.status = filters.status;
    if (filters.startDate || filters.endDate) {
      const sentAt: Record<string, Date> = {};
      if (filters.startDate) sentAt.gte = new Date(filters.startDate);
      if (filters.endDate) sentAt.lte = new Date(filters.endDate);
      where.sentAt = sentAt;
    }

    const page = filters.page ?? 1;
    const perPage = filters.perPage ?? 20;
    const skip = (page - 1) * perPage;

    const [messages, total] = await Promise.all([
      this.prisma.whatsAppMessage.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        skip,
        take: perPage,
        include: { contact: true },
      }),
      this.prisma.whatsAppMessage.count({ where }),
    ]);

    return {
      data: messages,
      total,
      page,
      pages: Math.max(Math.ceil(total / perPage), 1),
    };
  }

  // ─── Contacts ───────────────────────────────────────────

  async listContacts(page = 1, perPage = 20) {
    const skip = (page - 1) * perPage;
    const [contacts, total] = await Promise.all([
      this.prisma.whatsAppContact.findMany({
        orderBy: { lastMessageAt: 'desc' },
        skip,
        take: perPage,
      }),
      this.prisma.whatsAppContact.count(),
    ]);
    return { data: contacts, total, page, pages: Math.max(Math.ceil(total / perPage), 1) };
  }

  async upsertContact(dto: UpsertContactDto) {
    const existing = await this.prisma.whatsAppContact.findUnique({
      where: { phoneNumber: dto.phoneNumber },
    });
    if (existing) {
      return this.prisma.whatsAppContact.update({
        where: { id: existing.id },
        data: {
          name: dto.name,
          tags: JSON.stringify(dto.tags ?? []),
        },
      });
    }
    return this.prisma.whatsAppContact.create({
      data: {
        phoneNumber: dto.phoneNumber,
        name: dto.name,
        tags: JSON.stringify(dto.tags ?? []),
        isBlocked: false,
      },
    });
  }

  async deleteContact(id: number) {
    const contact = await this.prisma.whatsAppContact.findUnique({ where: { id } });
    if (!contact) throw new NotFoundException('Contato não encontrado');
    return this.prisma.whatsAppContact.delete({ where: { id } });
  }

  async toggleBlockContact(id: number) {
    const contact = await this.prisma.whatsAppContact.findUnique({ where: { id } });
    if (!contact) throw new NotFoundException('Contato não encontrado');
    return this.prisma.whatsAppContact.update({
      where: { id },
      data: { isBlocked: !contact.isBlocked },
    });
  }

  // ─── Templates ──────────────────────────────────────────

  async listTemplates() {
    return this.prisma.whatsAppTemplate.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createTemplate(dto: CreateTemplateDto) {
    return this.prisma.whatsAppTemplate.create({
      data: {
        name: dto.name,
        category: dto.category,
        language: dto.language,
        content: dto.content,
        variables: JSON.stringify(dto.variables ?? []),
        isActive: true,
      },
    });
  }

  async updateTemplate(id: number, dto: UpdateTemplateDto) {
    const template = await this.prisma.whatsAppTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template não encontrado');
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.language !== undefined) data.language = dto.language;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.variables !== undefined) data.variables = JSON.stringify(dto.variables);
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.whatsAppTemplate.update({ where: { id }, data });
  }

  async deleteTemplate(id: number) {
    const template = await this.prisma.whatsAppTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template não encontrado');
    return this.prisma.whatsAppTemplate.delete({ where: { id } });
  }

  // ─── Webhook ────────────────────────────────────────────

  async handleInboundMessage(from: string, messageId: string, type: string, content: string, mediaUrl?: string) {
    const contact = await this.findOrCreateContact(from);
    await this.prisma.whatsAppContact.update({
      where: { id: contact.id },
      data: { lastMessageAt: new Date() },
    });
    return this.prisma.whatsAppMessage.create({
      data: {
        contactId: contact.id,
        direction: 'inbound',
        type,
        content,
        mediaUrl,
        status: 'delivered',
        externalId: messageId,
        sentAt: new Date(),
        deliveredAt: new Date(),
      },
    });
  }

  async handleStatusUpdate(externalId: string, status: string) {
    const message = await this.prisma.whatsAppMessage.findFirst({
      where: { externalId },
    });
    if (!message) return null;
    const data: Record<string, unknown> = { status };
    if (status === 'delivered') data.deliveredAt = new Date();
    if (status === 'read') {
      data.readAt = new Date();
      if (!message.deliveredAt) data.deliveredAt = new Date();
    }
    return this.prisma.whatsAppMessage.update({ where: { id: message.id }, data });
  }

  // ─── KPIs ──────────────────────────────────────────────

  async getKPIs() {
    const [
      totalMessages,
      sentMessages,
      receivedMessages,
      deliveredMessages,
      readMessages,
      failedMessages,
      totalContacts,
      activeContacts,
      templatesCount,
    ] = await Promise.all([
      this.prisma.whatsAppMessage.count(),
      this.prisma.whatsAppMessage.count({ where: { direction: 'outbound' } }),
      this.prisma.whatsAppMessage.count({ where: { direction: 'inbound' } }),
      this.prisma.whatsAppMessage.count({ where: { status: 'delivered' } }),
      this.prisma.whatsAppMessage.count({ where: { status: 'read' } }),
      this.prisma.whatsAppMessage.count({ where: { status: 'failed' } }),
      this.prisma.whatsAppContact.count(),
      this.prisma.whatsAppContact.count({ where: { isBlocked: false } }),
      this.prisma.whatsAppTemplate.count({ where: { isActive: true } }),
    ]);

    const outbound = sentMessages || 1;
    return {
      totalMessages,
      sentMessages,
      receivedMessages,
      deliveredRate: Number(((deliveredMessages / outbound) * 100).toFixed(2)),
      readRate: Number(((readMessages / outbound) * 100).toFixed(2)),
      failedMessages,
      totalContacts,
      activeContacts,
      templatesCount,
    };
  }

  // ─── Helpers ────────────────────────────────────────────

  private async findOrCreateContact(phoneNumber: string) {
    const existing = await this.prisma.whatsAppContact.findUnique({
      where: { phoneNumber },
    });
    if (existing) return existing;
    return this.prisma.whatsAppContact.create({
      data: {
        phoneNumber,
        name: phoneNumber,
        tags: '[]',
        isBlocked: false,
      },
    });
  }
}
