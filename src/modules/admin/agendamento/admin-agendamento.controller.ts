import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import { AdminChatbotService } from './admin-chatbot.service'
import { ProactiveAgentService } from './proactive-agent.service'
import { PostConsultationWhatsAppService } from './post-consultation-whatsapp.service'
import { CreateProactiveRuleDto, UpdateProactiveRuleDto } from './dto/proactive-rule.dto'

interface AdminAppointment {
  id: string
  date: string
  username: string
  email: string
  telephone: string
  service: string
  professional: string
  typeOfService: string
  local: string
  type_appointment: string
  status: string
  day_of_month: number
  hour: number
  duration: number
  observations?: string
  /** Texto do prontuário / receitas enviado ao paciente (armazenado no agendamento em memória). */
  prescriptionText?: string
  /** ISO: último envio automático de receita por WhatsApp. */
  whatsappPrescriptionSentAt?: string
}

interface CreateAppointmentDto {
  date?: string
  username?: string
  email?: string
  telephone?: string
  service?: string
  professional?: string
  typeOfService?: string
  local?: string
  type_appointment?: string
  status?: string
  day_of_month?: number
  hour?: number
  duration?: number
  observations?: string
  prescriptionText?: string
  prescription_text?: string
  sendPrescriptionWhatsApp?: boolean
  forceResendWhatsApp?: boolean
}

function sanitizeAppointmentPatch(body: Record<string, unknown>): Partial<AdminAppointment> {
  const o = { ...body } as Record<string, unknown>
  delete o.sendPrescriptionWhatsApp
  delete o.forceResendWhatsApp
  if (typeof o.prescription_text === 'string' && o.prescriptionText == null) {
    o.prescriptionText = o.prescription_text
  }
  delete o.prescription_text
  return o as Partial<AdminAppointment>
}

@Controller('admin/agendamento')
export class AdminAgendamentoController {
  private readonly appointments: AdminAppointment[] = []

  constructor(
    private readonly chatbotService: AdminChatbotService,
    private readonly proactiveService: ProactiveAgentService,
    private readonly postConsultationWhatsApp: PostConsultationWhatsAppService,
  ) {}

  /**
   * Integrações (Google Sheets/Calendar/Gmail).
   * Front espera: { status: 'sucesso', data: { sheets, calendar, gmail } }
   */
  @Get('status')
  getStatus() {
    return {
      status: 'sucesso',
      data: {
        sheets: 'Online',
        calendar: 'Online',
        gmail: 'Offline',
      },
      // mensagem opcional para o front
      mensagem: 'OK',
    }
  }

  /**
   * Lista de agendamentos com filtros e paginação.
   * Front espera:
   * - status: 'sucesso'
   * - agendamentos: Appointment[]
   * - charts: ChartsResponse
   * - total, pages
   */
  @Get('lista')
  getLista(
    @Query('page') page = '1',
    @Query('per_page') perPage = '15',
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
    @Query('servico') servico?: string,
    @Query('profissional') profissional?: string,
    @Query('tipo_servico') tipoServico?: string,
    @Query('tipo_ag') tipoAg?: string,
    @Query('status') status?: string,
    @Query('local') local?: string,
  ) {
    const filtered = this.appointments.filter((a) => {
      if (dataInicio && a.date < dataInicio) return false
      if (dataFim && a.date > dataFim) return false
      if (servico && a.service !== servico) return false
      if (profissional && a.professional !== profissional) return false
      if (tipoServico && a.typeOfService !== tipoServico) return false
      if (tipoAg && a.type_appointment !== tipoAg) return false
      if (status && a.status !== status) return false
      if (local && a.local !== local) return false
      return true
    })

    const pageNum = Math.max(Number(page) || 1, 1)
    const perPageNum = Math.max(Number(perPage) || 15, 1)
    const start = (pageNum - 1) * perPageNum
    const paged = filtered.slice(start, start + perPageNum)

    const countBy = (key: keyof AdminAppointment) => {
      const map = new Map<string, number>()
      for (const item of filtered) {
        const value = String(item[key] ?? '')
        map.set(value, (map.get(value) ?? 0) + 1)
      }
      return {
        labels: Array.from(map.keys()),
        data: Array.from(map.values()),
      }
    }

    const total = filtered.length
    const pages = Math.max(Math.ceil(total / perPageNum), 1)

    return {
      status: 'sucesso',
      agendamentos: paged,
      charts: {
        appointmentsByService: countBy('service'),
        appointmentsByProfessional: countBy('professional'),
        appointmentsByTypeOfService: countBy('typeOfService'),
        appointmentsByType: countBy('type_appointment'),
      },
      total,
      pages,
      mensagem: 'OK',
    }
  }

  /**
   * KPIs baseados no dataset em memória.
   * Front espera:
   * - status: 'success' (ou 'sucesso')
   * - kpis: KPI
   * - charts?: ChartData | null
   */
  @Get('kpis')
  getKpis() {
    const totalAppointments = this.appointments.length
    const servicePrice: Record<string, number> = {
      'Consulta odontologica de avaliacao': 120,
      'Limpeza dental (profilaxia)': 180,
      'Clareamento dental': 600,
      'Restauracao (obturacao)': 250,
      'Tratamento de canal': 850,
      'Extracao simples': 300,
      'Implante dentario': 2400,
      'Aparelho ortodontico': 1800,
      'Manutencao ortodontica': 220,
      'Urgencia odontologica': 280,
    }

    const totalRevenue = this.appointments.reduce(
      (acc, a) => acc + (servicePrice[a.service] ?? 150),
      0,
    )
    const pendingRevenue = this.appointments
      .filter((a) => a.status.toLowerCase() === 'pendente')
      .reduce((acc, a) => acc + (servicePrice[a.service] ?? 150), 0)
    const done = this.appointments.filter((a) => a.status.toLowerCase() === 'concluido').length
    const canceled = this.appointments.filter((a) => a.status.toLowerCase() === 'cancelado').length
    const conversionRate = totalAppointments > 0 ? (done / totalAppointments) * 100 : 0
    const mediumTicket = totalAppointments > 0 ? totalRevenue / totalAppointments : 0

    return {
      status: 'success',
      kpis: {
        label: 'default',
        total_appointments: totalAppointments,
        total_revenue: Number(totalRevenue.toFixed(2)),
        pending_revenue: Number(pendingRevenue.toFixed(2)),
        conversion_rate: Number(conversionRate.toFixed(2)),
        emails_send: totalAppointments,
        showOffRate: totalAppointments > 0 ? Number(((canceled / totalAppointments) * 100).toFixed(2)) : 0,
        medium_ticket_value: Number(mediumTicket.toFixed(2)),
        cancellations: canceled,
      },
      charts: null,
    }
  }

  /**
   * Cria agendamento para testes e dashboard.
   */
  @Post('criar')
  async create(@Body() body: CreateAppointmentDto) {
    const date = body.date ?? new Date().toISOString().slice(0, 10)
    const parsedDate = new Date(`${date}T00:00:00`)
    const rx =
      (body.prescriptionText ?? body.prescription_text)?.trim() || undefined
    const appointment: AdminAppointment = {
      id: `ag-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      date,
      username: body.username?.trim() || 'Paciente Teste',
      email: body.email?.trim() || 'paciente.teste@example.com',
      telephone: body.telephone?.trim() || '(11) 90000-0000',
      service: body.service?.trim() || 'Consulta odontologica de avaliacao',
      professional: body.professional?.trim() || 'Dra. Ana Souza',
      typeOfService: body.typeOfService?.trim() || 'odontologia',
      local: body.local?.trim() || 'Clinica Centro',
      type_appointment: body.type_appointment?.trim() || 'Consulta',
      status: body.status?.trim() || 'Pendente',
      day_of_month: body.day_of_month ?? parsedDate.getDate(),
      hour: Number.isFinite(body.hour) ? Number(body.hour) : 9,
      duration: Number.isFinite(body.duration) ? Number(body.duration) : 60,
      observations: body.observations?.trim() || undefined,
      prescriptionText: rx,
    }

    this.appointments.unshift(appointment)

    const emptyPrev: AdminAppointment = {
      ...appointment,
      prescriptionText: '',
      whatsappPrescriptionSentAt: undefined,
      status: '',
    }
    let whatsappFollowUp: { sent: boolean; parts?: number; skipped?: string; error?: string } | null =
      null
    try {
      whatsappFollowUp = await this.postConsultationWhatsApp.trySendAfterUpdate(
        emptyPrev,
        appointment,
        body as Record<string, unknown>,
      )
    } catch {
      whatsappFollowUp = null
    }
    if (whatsappFollowUp?.sent) {
      appointment.whatsappPrescriptionSentAt = new Date().toISOString()
    }

    return {
      status: 'sucesso',
      success: true,
      data: appointment,
      mensagem: 'Agendamento criado com sucesso',
      whatsappFollowUp,
    }
  }

  /**
   * Atualização (placeholder).
   * Front chama: PUT /admin/agendamento/:id/atualizar com JSON body.
   */
  @Put(':id/atualizar')
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const idx = this.appointments.findIndex((a) => a.id === id)
    if (idx === -1) return { status: 'erro', id, message: 'Agendamento não encontrado' }
    const prev = { ...this.appointments[idx] }
    const patch = sanitizeAppointmentPatch(body)
    this.appointments[idx] = { ...this.appointments[idx], ...patch, id }
    const merged = this.appointments[idx]

    let whatsappFollowUp: { sent: boolean; parts?: number; skipped?: string; error?: string } | null =
      null
    try {
      whatsappFollowUp = await this.postConsultationWhatsApp.trySendAfterUpdate(
        prev,
        merged,
        body,
      )
    } catch {
      whatsappFollowUp = null
    }
    if (whatsappFollowUp?.sent) {
      this.appointments[idx].whatsappPrescriptionSentAt = new Date().toISOString()
    }

    return { status: 'sucesso', id, message: 'OK', whatsappFollowUp }
  }

  /**
   * Exclusão (placeholder).
   * Front chama: DELETE /admin/agendamento/:id/deletar.
   */
  @Delete(':id/deletar')
  remove(@Param('id') id: string) {
    const idx = this.appointments.findIndex((a) => a.id === id)
    if (idx >= 0) this.appointments.splice(idx, 1)
    return { status: 'sucesso', id, message: 'OK' }
  }

  /**
   * Busca de informacoes para chatbot com suporte a:
   * - DB (usuarios)
   * - API (endpoints conhecidos)
   */
  @Post('chatbot/search')
  async chatbotSearch(
    @Body() body: { query?: string; source?: 'db' | 'api' | 'both' },
  ) {
    const query = body?.query ?? ''
    const source = body?.source ?? 'both'
    const data = await this.chatbotService.searchInfo(query, source)

    return {
      status: 'sucesso',
      data,
      mensagem: 'Busca executada com sucesso',
    }
  }

  // ─── Proactive Agent ────────────────────────────────────────

  /** Cria uma nova regra proativa para o agente. */
  @Post('proactive/rules')
  async createProactiveRule(@Body() dto: CreateProactiveRuleDto) {
    const rule = await this.proactiveService.createRule(dto)
    return { status: 'sucesso', data: rule, mensagem: 'Regra criada com sucesso' }
  }

  /** Lista as regras proativas de um usuário. */
  @Get('proactive/rules')
  async listProactiveRules(@Query('userId') userId: string) {
    const rules = await this.proactiveService.listRules(Number(userId))
    return { status: 'sucesso', data: rules }
  }

  /** Atualiza uma regra proativa. */
  @Patch('proactive/rules/:id')
  async updateProactiveRule(
    @Param('id') id: string,
    @Body() dto: UpdateProactiveRuleDto,
  ) {
    const rule = await this.proactiveService.updateRule(Number(id), dto)
    return { status: 'sucesso', data: rule, mensagem: 'Regra atualizada' }
  }

  /** Remove uma regra proativa. */
  @Delete('proactive/rules/:id')
  async deleteProactiveRule(@Param('id') id: string) {
    await this.proactiveService.deleteRule(Number(id))
    return { status: 'sucesso', mensagem: 'Regra removida' }
  }

  /** Ativa/desativa uma regra proativa. */
  @Patch('proactive/rules/:id/toggle')
  async toggleProactiveRule(@Param('id') id: string) {
    const rule = await this.proactiveService.toggleRule(Number(id))
    return { status: 'sucesso', data: rule }
  }

  /**
   * Verifica e retorna mensagens proativas pendentes (interval/schedule).
   * O front faz polling neste endpoint.
   */
  @Get('proactive/check')
  async checkProactiveMessages(@Query('userId') userId: string) {
    const messages = await this.proactiveService.checkProactiveMessages(Number(userId))
    return { status: 'sucesso', data: messages }
  }

  /**
   * Dispara regras proativas baseadas em evento.
   * Chamado internamente quando um evento ocorre (ex.: novo agendamento).
   */
  @Post('proactive/fire-event')
  async fireEvent(@Body() body: { userId: number; event: string }) {
    const messages = await this.proactiveService.fireEventRule(body.userId, body.event)
    return { status: 'sucesso', data: messages }
  }
}

