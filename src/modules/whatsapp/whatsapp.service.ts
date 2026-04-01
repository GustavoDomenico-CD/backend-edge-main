import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as path from 'path';
import { mkdir, rm } from 'fs/promises';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WASocket,
  type WAMessage,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
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

  private sock: WASocket | null = null;
  private qrDataUrl: string | null = null;
  private connecting = false;
  private activeInstanceName: string | null = null;

  private sessionsBaseDir() {
    // Persisted on disk: survives restarts.
    return path.resolve(process.cwd(), '.wa_sessions');
  }

  private sessionDir(instanceName: string) {
    return path.join(this.sessionsBaseDir(), instanceName.replace(/[^\w.-]/g, '_'));
  }

  private async ensureSessionDir(instanceName: string) {
    await mkdir(this.sessionDir(instanceName), { recursive: true });
  }

  private normalizeToJid(to: string) {
    const trimmed = (to || '').trim();
    if (!trimmed) return '';
    if (trimmed.includes('@s.whatsapp.net') || trimmed.includes('@g.us')) return trimmed;
    const digits = trimmed.replace(/[^\d]/g, '');
    return `${digits}@s.whatsapp.net`;
  }

  private async updateActiveConfigStatus(status: string, phoneNumber?: string | null) {
    const cfg = await this.getConfig();
    if (!cfg) return;
    await this.prisma.whatsAppConfig.update({
      where: { id: cfg.id },
      data: {
        status,
        phoneNumber: phoneNumber ?? cfg.phoneNumber,
      },
    });
  }

  async connectActive(forceNewSocket = false) {
    const cfg = await this.getConfig();
    if (!cfg) throw new NotFoundException('Nenhuma configuração ativa encontrada');

    if (!forceNewSocket && this.sock && this.activeInstanceName === cfg.instanceName) {
      return {
        connected: cfg.status === 'connected',
        status: cfg.status,
        phoneNumber: cfg.phoneNumber ?? null,
        instanceName: cfg.instanceName ?? null,
        qr: this.qrDataUrl,
      };
    }

    if (this.connecting) {
      return {
        connected: cfg.status === 'connected',
        status: cfg.status,
        phoneNumber: cfg.phoneNumber ?? null,
        instanceName: cfg.instanceName ?? null,
        qr: this.qrDataUrl,
      };
    }

    this.connecting = true;
    this.activeInstanceName = cfg.instanceName;
    this.qrDataUrl = null;

    await this.ensureSessionDir(cfg.instanceName);

    const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir(cfg.instanceName));
    const { version } = await fetchLatestBaileysVersion();

    const logger = pino({ level: 'silent' });

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: true,
      syncFullHistory: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        // DataURL is easiest for frontend.
        this.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 280 });
        await this.updateActiveConfigStatus('qr');
      }

      if (connection === 'open') {
        const me = sock.user?.id ?? null;
        const phone = me ? String(me).split(':')[0].replace(/[^\d]/g, '') : null;
        this.qrDataUrl = null;
        await this.updateActiveConfigStatus('connected', phone);
      }

      if (connection === 'close') {
        this.qrDataUrl = null;
        const code = (lastDisconnect?.error as any)?.output?.statusCode as number | undefined;
        const reason = code ? (DisconnectReason as any)[code] : undefined;
        await this.updateActiveConfigStatus('disconnected');

        // If logged out, we should require a new QR.
        if (code === DisconnectReason.loggedOut) {
          // keep session files; user can call reset-session explicitly
        } else {
          // Attempt reconnect on transient failures.
          if (this.activeInstanceName === cfg.instanceName) {
            // best-effort reconnect (do not loop hard)
            setTimeout(() => {
              this.connectActive(true).catch(() => {});
            }, 1500);
          }
        }

        // cleanup socket reference if this is current
        if (this.sock === sock) {
          this.sock = null;
        }
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      try {
        if (m.type !== 'notify') return;
        for (const msg of m.messages) {
          await this.persistInboundIfNeeded(msg);
        }
      } catch {
        // ignore
      }
    });

    this.sock = sock;
    await this.updateActiveConfigStatus('connecting');
    this.connecting = false;

    // Give Baileys a short window to emit QR/open state, so frontend
    // can usually render the QR right after clicking "Conectar".
    const startedAt = Date.now();
    const waitMs = 8000;
    while (Date.now() - startedAt < waitMs) {
      const fresh = await this.getConfig();
      if (this.qrDataUrl || fresh?.status === 'connected' || fresh?.status === 'qr') break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const fresh = await this.getConfig();

    return {
      connected: fresh?.status === 'connected',
      status: fresh?.status ?? 'connecting',
      phoneNumber: fresh?.phoneNumber ?? cfg.phoneNumber ?? null,
      instanceName: fresh?.instanceName ?? cfg.instanceName ?? null,
      qr: this.qrDataUrl,
    };
  }

  async disconnectActive(logout = false) {
    this.qrDataUrl = null;
    const sock = this.sock;
    this.sock = null;
    this.connecting = false;
    if (sock) {
      try {
        if (logout) await sock.logout();
      } catch {
        // ignore
      }
      try {
        sock.end(undefined);
      } catch {
        // ignore
      }
    }
    await this.updateActiveConfigStatus('disconnected');
    return { success: true };
  }

  async resetActiveSession() {
    const cfg = await this.getConfig();
    if (!cfg) throw new NotFoundException('Nenhuma configuração ativa encontrada');
    await this.disconnectActive(true);
    await rm(this.sessionDir(cfg.instanceName), { recursive: true, force: true });
    await this.updateActiveConfigStatus('disconnected');
    return { success: true };
  }

  private async ensureConnectedSocket() {
    const cfg = await this.getConfig();
    if (!cfg) throw new NotFoundException('Nenhuma configuração ativa encontrada');
    if (!this.sock) {
      await this.connectActive(true);
    }
    if (!this.sock) throw new ServiceUnavailableException('WhatsApp não está conectado');
    if (cfg.status !== 'connected') {
      throw new ServiceUnavailableException('WhatsApp não está conectado (aguarde QR/pareamento)');
    }
    return this.sock;
  }

  private async persistInboundIfNeeded(msg: WAMessage) {
    const remoteJid = msg.key?.remoteJid;
    if (!remoteJid) return;
    if (msg.key?.fromMe) return;
    if (isJidBroadcast(remoteJid)) return;

    const from = remoteJid.replace('@s.whatsapp.net', '');
    const messageId = msg.key?.id ?? `baileys_${Date.now()}`;

    let type = 'text';
    let content = '';
    let mediaUrl: string | undefined;

    const m = msg.message as any;
    if (!m) return;

    if (m.conversation) {
      content = String(m.conversation);
    } else if (m.extendedTextMessage?.text) {
      content = String(m.extendedTextMessage.text);
    } else if (m.imageMessage) {
      type = 'image';
      content = String(m.imageMessage.caption ?? '');
    } else if (m.videoMessage) {
      type = 'video';
      content = String(m.videoMessage.caption ?? '');
    } else if (m.documentMessage) {
      type = 'document';
      content = String(m.documentMessage.caption ?? '');
    } else if (m.audioMessage) {
      type = 'audio';
      content = '';
    } else {
      type = 'unknown';
      content = '';
    }

    await this.handleInboundMessage(from, messageId, type, content, mediaUrl);
  }

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
      qr: this.qrDataUrl,
    };
  }

  // ─── Messages ───────────────────────────────────────────

  async sendTextMessage(dto: SendTextMessageDto) {
    const sock = await this.ensureConnectedSocket();
    const toJid = this.normalizeToJid(dto.to);
    if (!toJid) throw new NotFoundException('Destino inválido');

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

    try {
      const res = await sock.sendMessage(toJid, { text: dto.text });
      await this.prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: { status: 'sent', externalId: res?.key?.id ?? null },
      });
    } catch (err: unknown) {
      await this.prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: { status: 'failed' },
      });
      const msg = err instanceof Error ? err.message : 'Falha ao enviar mensagem';
      throw new ServiceUnavailableException(msg);
    }

    return { success: true, messageId: message.id };
  }

  async sendTemplateMessage(dto: SendTemplateMessageDto) {
    const sock = await this.ensureConnectedSocket();
    const toJid = this.normalizeToJid(dto.to);
    if (!toJid) throw new NotFoundException('Destino inválido');

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
        status: 'pending',
        templateName: dto.templateName,
        sentAt: new Date(),
      },
    });

    try {
      const res = await sock.sendMessage(toJid, { text: content });
      await this.prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: { status: 'sent', externalId: res?.key?.id ?? null },
      });
    } catch (err: unknown) {
      await this.prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: { status: 'failed' },
      });
      const msg = err instanceof Error ? err.message : 'Falha ao enviar template';
      throw new ServiceUnavailableException(msg);
    }

    return { success: true, messageId: message.id };
  }

  async sendMediaMessage(dto: SendMediaMessageDto) {
    const sock = await this.ensureConnectedSocket();
    const toJid = this.normalizeToJid(dto.to);
    if (!toJid) throw new NotFoundException('Destino inválido');

    const contact = await this.findOrCreateContact(dto.to);
    const message = await this.prisma.whatsAppMessage.create({
      data: {
        contactId: contact.id,
        direction: 'outbound',
        type: dto.type,
        content: dto.caption ?? '',
        mediaUrl: dto.mediaUrl,
        status: 'pending',
        sentAt: new Date(),
      },
    });

    try {
      // Baileys expects a direct URL or buffer. We'll treat mediaUrl as a URL.
      const anyMsg: any = {};
      if (dto.type === 'image') anyMsg.image = { url: dto.mediaUrl };
      if (dto.type === 'video') anyMsg.video = { url: dto.mediaUrl };
      if (dto.type === 'audio') anyMsg.audio = { url: dto.mediaUrl };
      if (dto.type === 'document') anyMsg.document = { url: dto.mediaUrl, fileName: dto.filename ?? 'arquivo' };
      if (dto.caption) anyMsg.caption = dto.caption;

      const res = await sock.sendMessage(toJid, anyMsg);
      await this.prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: { status: 'sent', externalId: res?.key?.id ?? null },
      });
    } catch (err: unknown) {
      await this.prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: { status: 'failed' },
      });
      const msg = err instanceof Error ? err.message : 'Falha ao enviar mídia';
      throw new ServiceUnavailableException(msg);
    }

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

  async toggleAgentContact(id: number) {
    const contact = await this.prisma.whatsAppContact.findUnique({ where: { id } });
    if (!contact) throw new NotFoundException('Contato não encontrado');
    return this.prisma.whatsAppContact.update({
      where: { id },
      data: { agentEnabled: !contact.agentEnabled },
    });
  }

  async isAgentEnabledForPhone(phoneNumber: string): Promise<boolean> {
    const contact = await this.prisma.whatsAppContact.findUnique({
      where: { phoneNumber },
    });
    return contact?.agentEnabled ?? true;
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
    const message = await this.prisma.whatsAppMessage.create({
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
    return { ...message, agentEnabled: contact.agentEnabled };
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
