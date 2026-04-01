import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as path from 'path';
import { mkdir, rm } from 'fs/promises';
import makeWASocket, {
  Browsers,
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
  /** String exata do evento Baileys — é o que deve ser codificado no QR (docs: enviar ao front). */
  private qrRaw: string | null = null;
  private connecting = false;
  private activeInstanceName: string | null = null;

  private normalizeQrPayload(qr: unknown): string | null {
    if (qr == null) return null;
    if (typeof qr === 'string') return qr;
    if (Buffer.isBuffer(qr)) return qr.toString('utf8');
    return String(qr);
  }

  /** Gera PNG (data URL) a partir do payload oficial do WhatsApp Web; evita QR “válido” mas ilegível. */
  private async encodeQrToDataUrl(raw: string): Promise<string | null> {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      return await QRCode.toDataURL(trimmed, {
        type: 'image/png',
        errorCorrectionLevel: 'L',
        margin: 2,
        width: 512,
        color: { dark: '#000000', light: '#ffffff' },
      });
    } catch {
      return null;
    }
  }

  private async applyQrUpdate(qr: unknown) {
    const raw = this.normalizeQrPayload(qr);
    if (!raw?.trim()) return;
    this.qrRaw = raw;
    this.qrDataUrl = await this.encodeQrToDataUrl(raw);
    await this.updateActiveConfigStatus('qr');
  }

  private clearQr() {
    this.qrDataUrl = null;
    this.qrRaw = null;
  }

  private sessionsBaseDir() {
    return path.resolve(process.cwd(), '.wa_sessions');
  }

  private sessionDir(instanceName: string) {
    return path.join(this.sessionsBaseDir(), instanceName.replace(/[^\w.-]/g, '_'));
  }

  private async ensureSessionDir(instanceName: string) {
    await mkdir(this.sessionDir(instanceName), { recursive: true });
  }

  /**
   * Dígitos E.164 sem + (ex.: Brasil 5511999999999).
   * Se vier 10/11 dígitos sem DDI, assume Brasil e prefixa 55.
   */
  private normalizePhoneDigits(input: string): string {
    const d = (input || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length >= 12) return d;
    if (d.length === 10 || d.length === 11) return `55${d}`;
    return d;
  }

  private normalizeToJid(to: string) {
    const trimmed = (to || '').trim();
    if (!trimmed) return '';
    if (trimmed.includes('@s.whatsapp.net') || trimmed.includes('@g.us')) return trimmed;
    const digits = this.normalizePhoneDigits(trimmed);
    if (!digits) return '';
    return `${digits}@s.whatsapp.net`;
  }

  private async resolveMediaBuffer(dto: SendMediaMessageDto): Promise<{ buffer: Buffer; mimeType?: string }> {
    const b64 = dto.mediaBase64?.trim();
    if (b64) {
      const raw = b64.includes('base64,') ? b64.split('base64,')[1] ?? '' : b64;
      if (!raw) throw new BadRequestException('Base64 inválido');
      return { buffer: Buffer.from(raw, 'base64'), mimeType: dto.mimeType };
    }
    const url = dto.mediaUrl?.trim();
    if (!url) {
      throw new BadRequestException('Informe mediaUrl ou mediaBase64');
    }
    if (url.startsWith('data:')) {
      const raw = url.split('base64,')[1];
      if (!raw) throw new BadRequestException('Data URL inválida');
      return { buffer: Buffer.from(raw, 'base64'), mimeType: dto.mimeType };
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) {
        throw new ServiceUnavailableException(`Não foi possível baixar a mídia (HTTP ${res.status})`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const ct = res.headers.get('content-type') ?? undefined;
      return { buffer: buf, mimeType: dto.mimeType ?? ct ?? undefined };
    }
    throw new BadRequestException('mediaUrl deve ser HTTP(S) ou data:');
  }

  private async updateActiveConfigStatus(status: string, phoneNumber?: string | null) {
    const cfg = await this.getOrCreateConfig();
    await this.prisma.whatsAppConfig.update({
      where: { id: cfg.id },
      data: {
        status,
        phoneNumber: phoneNumber ?? cfg.phoneNumber,
      },
    });
  }

  /**
   * Returns the active config, auto-creating a default one if none exists.
   * This removes the need for manual config creation.
   */
  async getOrCreateConfig() {
    const existing = await this.prisma.whatsAppConfig.findFirst({ where: { isActive: true } });
    if (existing) return existing;

    return this.prisma.whatsAppConfig.create({
      data: {
        instanceName: 'default',
        phoneNumber: '',
        apiKey: '',
        status: 'disconnected',
        isActive: true,
      },
    });
  }

  async connectActive(forceNewSocket = false) {
    const cfg = await this.getOrCreateConfig();

    if (!forceNewSocket && this.sock && this.activeInstanceName === cfg.instanceName) {
      return {
        connected: cfg.status === 'connected',
        status: cfg.status,
        phoneNumber: cfg.phoneNumber || null,
        instanceName: cfg.instanceName,
        qr: this.qrDataUrl,
        qrRaw: this.qrRaw,
      };
    }

    if (this.connecting) {
      return {
        connected: cfg.status === 'connected',
        status: cfg.status,
        phoneNumber: cfg.phoneNumber || null,
        instanceName: cfg.instanceName,
        qr: this.qrDataUrl,
        qrRaw: this.qrRaw,
      };
    }

    this.connecting = true;
    this.activeInstanceName = cfg.instanceName;
    this.clearQr();

    await this.ensureSessionDir(cfg.instanceName);

    const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir(cfg.instanceName));

    let version: [number, number, number];
    try {
      const fetched = await fetchLatestBaileysVersion();
      version = [...fetched.version] as [number, number, number];
    } catch {
      version = [2, 3000, 1035194821];
    }

    const logger = pino({ level: 'silent' });

    const sock = makeWASocket({
      version,
      browser: Browsers.macOS('Chrome'),
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
        await this.applyQrUpdate(qr);
      }

      if (connection === 'open') {
        const me = sock.user?.id ?? null;
        const phone = me ? String(me).split(':')[0].replace(/[^\d]/g, '') : null;
        this.clearQr();
        await this.updateActiveConfigStatus('connected', phone);
      }

      if (connection === 'close') {
        this.clearQr();
        const code = (lastDisconnect?.error as any)?.output?.statusCode as number | undefined;
        await this.updateActiveConfigStatus('disconnected');

        if (code === DisconnectReason.loggedOut) {
          // keep session files; user can call reset-session explicitly
        } else {
          if (this.activeInstanceName === cfg.instanceName) {
            setTimeout(() => {
              this.connectActive(true).catch(() => {});
            }, 1500);
          }
        }

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

    // Give Baileys a short window to emit QR/open state
    const startedAt = Date.now();
    const waitMs = 8000;
    while (Date.now() - startedAt < waitMs) {
      const fresh = await this.getOrCreateConfig();
      if (this.qrDataUrl || fresh.status === 'connected' || fresh.status === 'qr') break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const fresh = await this.getOrCreateConfig();

    return {
      connected: fresh.status === 'connected',
      status: fresh.status,
      phoneNumber: fresh.phoneNumber || null,
      instanceName: fresh.instanceName,
      qr: this.qrDataUrl,
      qrRaw: this.qrRaw,
    };
  }

  async disconnectActive(logout = false) {
    this.clearQr();
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
    const cfg = await this.getOrCreateConfig();
    await this.disconnectActive(true);
    await rm(this.sessionDir(cfg.instanceName), { recursive: true, force: true });
    await this.updateActiveConfigStatus('disconnected');
    return { success: true };
  }

  private async ensureConnectedSocket() {
    const cfg = await this.getOrCreateConfig();
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

  // ─── Status ─────────────────────────────────────────────

  async getConnectionStatus() {
    const config = await this.getOrCreateConfig();
    return {
      connected: config.status === 'connected',
      status: config.status,
      phoneNumber: config.phoneNumber || null,
      instanceName: config.instanceName,
      qr: this.qrDataUrl,
      qrRaw: this.qrRaw,
    };
  }

  // ─── Messages ───────────────────────────────────────────

  async sendTextMessage(dto: SendTextMessageDto) {
    const sock = await this.ensureConnectedSocket();
    const toJid = this.normalizeToJid(dto.to);
    if (!toJid) throw new NotFoundException('Destino inválido');

    const phone = this.normalizePhoneDigits(dto.to);
    if (!phone) throw new BadRequestException('Número de destino inválido');
    const contact = await this.findOrCreateContact(phone);
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

    const phone = this.normalizePhoneDigits(dto.to);
    if (!phone) throw new BadRequestException('Número de destino inválido');
    const contact = await this.findOrCreateContact(phone);
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

    const { buffer, mimeType } = await this.resolveMediaBuffer(dto);
    if (buffer.length > 16 * 1024 * 1024) {
      throw new BadRequestException('Arquivo muito grande (máx. 16 MB)');
    }

    const phone = this.normalizePhoneDigits(dto.to);
    if (!phone) throw new BadRequestException('Número de destino inválido');
    const contact = await this.findOrCreateContact(phone);
    const mediaRef =
      dto.mediaUrl?.slice(0, 500) ?? (dto.mediaBase64 ? '[base64]' : undefined);

    const message = await this.prisma.whatsAppMessage.create({
      data: {
        contactId: contact.id,
        direction: 'outbound',
        type: dto.type,
        content: dto.caption ?? '',
        mediaUrl: mediaRef,
        status: 'pending',
        sentAt: new Date(),
      },
    });

    try {
      const res = await (async () => {
        if (dto.type === 'image') {
          return sock.sendMessage(toJid, {
            image: buffer,
            caption: dto.caption,
          });
        }
        if (dto.type === 'video') {
          return sock.sendMessage(toJid, {
            video: buffer,
            caption: dto.caption,
          });
        }
        if (dto.type === 'audio') {
          return sock.sendMessage(toJid, {
            audio: buffer,
            ptt: false,
            mimetype: mimeType ?? 'audio/mpeg',
          });
        }
        return sock.sendMessage(toJid, {
          document: buffer,
          mimetype: mimeType ?? 'application/octet-stream',
          fileName: dto.filename ?? 'arquivo',
          caption: dto.caption,
        });
      })();

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
    const phone = this.normalizePhoneDigits(dto.phoneNumber);
    if (!phone) throw new BadRequestException('Número inválido');
    const existing = await this.prisma.whatsAppContact.findUnique({
      where: { phoneNumber: phone },
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
        phoneNumber: phone,
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

  // ─── Inbound handling ──────────────────────────────────

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
