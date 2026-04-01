import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WhatsAppService } from '../../whatsapp/whatsapp.service';

/** Limite seguro abaixo do teto do WhatsApp (~4096) para mensagens em texto. */
const WHATSAPP_TEXT_CHUNK = 3500;

export type AppointmentFollowUpSnapshot = {
  id: string;
  date: string;
  username: string;
  telephone: string;
  service: string;
  professional: string;
  status?: string;
  prescriptionText?: string;
  whatsappPrescriptionSentAt?: string;
};

@Injectable()
export class PostConsultationWhatsAppService {
  private readonly logger = new Logger(PostConsultationWhatsAppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  private normalizeStatus(s?: string): string {
    return (s ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /** Status que indicam atendimento concluído (pós-consulta / serviço realizado). */
  isPostServiceCompletedStatus(status?: string): boolean {
    const x = this.normalizeStatus(status);
    if (!x) return false;
    const hints = [
      'concluid',
      'completed',
      'realizado',
      'feito',
      'atendido',
      'tratamento conclu',
    ];
    return hints.some((h) => x.includes(h));
  }

  private chunkText(text: string, maxLen: number): string[] {
    const t = text.trim();
    if (!t) return [];
    const chunks: string[] = [];
    for (let i = 0; i < t.length; i += maxLen) {
      chunks.push(t.slice(i, i + maxLen));
    }
    return chunks;
  }

  private buildIntro(a: AppointmentFollowUpSnapshot): string {
    const name = (a.username || 'Paciente').trim();
    const date = (a.date || '').trim();
    const prof = (a.professional || '').trim();
    const svc = (a.service || '').trim();
    return [
      `Olá, ${name}!`,
      '',
      `Segue o resumo do seu atendimento${date ? ` (${date})` : ''}${prof ? ` com ${prof}` : ''}${svc ? ` — ${svc}` : ''}.`,
      '',
      '📋 Receitas e orientações:',
      '',
    ].join('\n');
  }

  /**
   * Envia WhatsApp com receita/prontuário quando:
   * - há texto em `prescriptionText` (corpo ou já salvo no agendamento);
   * - status indica atendimento concluído;
   * - `sendPrescriptionWhatsApp === true` OU env `WA_AUTO_PRESCRIPTION_WHATSAPP=1`;
   * - ainda não enviado (`whatsappPrescriptionSentAt` vazio), salvo `forceResendWhatsApp`.
   */
  async trySendAfterUpdate(
    previous: AppointmentFollowUpSnapshot,
    merged: AppointmentFollowUpSnapshot,
    body: Record<string, unknown>,
  ): Promise<{ sent: boolean; parts?: number; skipped?: string; error?: string } | null> {
    const fromBody =
      typeof body.prescriptionText === 'string'
        ? body.prescriptionText
        : typeof body.prescription_text === 'string'
          ? body.prescription_text
          : '';
    const prescription = fromBody.trim() || (merged.prescriptionText || '').trim();
    if (!prescription) return null;

    const autoEnv = process.env.WA_AUTO_PRESCRIPTION_WHATSAPP === '1';
    const explicit = body.sendPrescriptionWhatsApp === true;
    const forceResend = body.forceResendWhatsApp === true;

    if (!autoEnv && !explicit) return null;

    if (!this.isPostServiceCompletedStatus(merged.status)) {
      await this.safeLog({
        appointmentId: merged.id,
        patientPhone: merged.telephone || '',
        patientName: merged.username,
        status: 'skipped',
        partsSent: 0,
        error: 'status_not_completed',
      });
      return { skipped: 'status_not_completed' };
    }

    if (merged.whatsappPrescriptionSentAt && !forceResend) {
      await this.safeLog({
        appointmentId: merged.id,
        patientPhone: merged.telephone || '',
        patientName: merged.username,
        status: 'skipped',
        partsSent: 0,
        error: 'already_sent',
      });
      return { skipped: 'already_sent' };
    }

    const phone = (merged.telephone || '').trim();
    if (!phone) {
      await this.safeLog({
        appointmentId: merged.id,
        patientPhone: '',
        patientName: merged.username,
        status: 'failed',
        partsSent: 0,
        error: 'missing_phone',
      });
      return { error: 'missing_phone' };
    }

    const intro = this.buildIntro(merged);
    const prescriptionChunks = this.chunkText(prescription, WHATSAPP_TEXT_CHUNK);
    const messages: string[] = [];
    if (prescriptionChunks.length <= 1) {
      messages.push(intro + (prescriptionChunks[0] ?? ''));
    } else {
      messages.push(intro + (prescriptionChunks[0] ?? ''));
      for (let i = 1; i < prescriptionChunks.length; i++) {
        messages.push(
          `(continuação ${i + 1}/${prescriptionChunks.length})\n\n${prescriptionChunks[i]}`,
        );
      }
    }

    let parts = 0;
    try {
      for (const text of messages) {
        await this.whatsapp.sendTextMessage({ to: phone, text });
        parts++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.safeLog({
        appointmentId: merged.id,
        patientPhone: phone,
        patientName: merged.username,
        status: parts > 0 ? 'partial' : 'failed',
        partsSent: parts,
        error: msg,
      });
      return { sent: false, parts, error: msg };
    }

    await this.safeLog({
      appointmentId: merged.id,
      patientPhone: phone,
      patientName: merged.username,
      status: 'sent',
      partsSent: parts,
      error: null,
    });

    return { sent: true, parts };
  }

  private async safeLog(data: {
    appointmentId: string;
    patientPhone: string;
    patientName?: string;
    status: string;
    partsSent: number;
    error: string | null;
  }) {
    try {
      await this.prisma.consultationWhatsAppLog.create({ data });
    } catch (err) {
      this.logger.warn(`ConsultationWhatsAppLog: ${err}`);
    }
  }
}
