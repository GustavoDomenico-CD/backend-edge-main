import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common'
import { AdminChatbotService } from './admin-chatbot.service'

@Controller('admin/agendamento')
export class AdminAgendamentoController {
  constructor(private readonly chatbotService: AdminChatbotService) {}

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
}

