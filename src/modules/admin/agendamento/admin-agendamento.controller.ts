import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import { AdminChatbotService } from './admin-chatbot.service'
import { ProactiveAgentService } from './proactive-agent.service'
import { CreateProactiveRuleDto, UpdateProactiveRuleDto } from './dto/proactive-rule.dto'

@Controller('admin/agendamento')
export class AdminAgendamentoController {
  constructor(
    private readonly chatbotService: AdminChatbotService,
    private readonly proactiveService: ProactiveAgentService,
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
   * Lista de agendamentos (placeholder).
   * Front espera:
   * - status: 'sucesso'
   * - agendamentos: Appointment[]
   * - charts: ChartsResponse
   * - total, pages
   */
  @Get('lista')
  getLista() {
    return {
      status: 'sucesso',
      agendamentos: [],
      charts: {
        appointmentsByService: { labels: [], data: [] },
        appointmentsByProfessional: { labels: [], data: [] },
        appointmentsByTypeOfService: { labels: [], data: [] },
        appointmentsByType: { labels: [], data: [] },
      },
      total: 0,
      pages: 1,
      mensagem: 'OK',
    }
  }

  /**
   * KPIs (placeholder).
   * Front espera:
   * - status: 'success' (ou 'sucesso')
   * - kpis: KPI
   * - charts?: ChartData | null
   */
  @Get('kpis')
  getKpis() {
    return {
      status: 'success',
      kpis: {
        label: 'default',
        total_appointments: 0,
        total_revenue: 0,
        pending_revenue: 0,
        conversion_rate: 0,
        emails_send: 0,
        showOffRate: 0,
        medium_ticket_value: 0,
        cancellations: 0,
      },
      charts: null,
    }
  }

  /**
   * Atualização (placeholder).
   * Front chama: PUT /admin/agendamento/:id/atualizar com JSON body.
   */
  @Put(':id/atualizar')
  update(@Param('id') id: string, @Body() _body: unknown) {
    return { status: 'sucesso', id, message: 'OK' }
  }

  /**
   * Exclusão (placeholder).
   * Front chama: DELETE /admin/agendamento/:id/deletar.
   */
  @Delete(':id/deletar')
  remove(@Param('id') id: string) {
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

