import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import {
  CreateProactiveRuleDto,
  UpdateProactiveRuleDto,
} from './dto/proactive-rule.dto'

@Injectable()
export class ProactiveAgentService {
  constructor(private readonly prisma: PrismaService) {}

  async createRule(dto: CreateProactiveRuleDto) {
    return this.prisma.proactiveRule.create({
      data: {
        userId: dto.userId,
        trigger: dto.trigger,
        condition: dto.condition as any,
        message: dto.message,
        isActive: dto.isActive ?? true,
      },
    })
  }

  async listRules(userId: number) {
    return this.prisma.proactiveRule.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async updateRule(id: number, dto: UpdateProactiveRuleDto) {
    return this.prisma.proactiveRule.update({
      where: { id },
      data: {
        ...(dto.trigger !== undefined && { trigger: dto.trigger }),
        ...(dto.condition !== undefined && { condition: dto.condition as any }),
        ...(dto.message !== undefined && { message: dto.message }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    })
  }

  async deleteRule(id: number) {
    return this.prisma.proactiveRule.delete({ where: { id } })
  }

  async toggleRule(id: number) {
    const rule = await this.prisma.proactiveRule.findUniqueOrThrow({
      where: { id },
    })
    return this.prisma.proactiveRule.update({
      where: { id },
      data: { isActive: !rule.isActive },
    })
  }

  /**
   * Verifica regras ativas de um usuário e retorna mensagens proativas
   * que devem ser disparadas agora.
   */
  async checkProactiveMessages(userId: number) {
    const rules = await this.prisma.proactiveRule.findMany({
      where: { userId, isActive: true },
    })

    const now = new Date()
    const messages: { ruleId: number; message: string; trigger: string }[] = []

    for (const rule of rules) {
      const condition = rule.condition as Record<string, unknown>

      if (rule.trigger === 'interval') {
        const intervalMinutes = (condition.intervalMinutes as number) || 30
        const lastFired = rule.lastFiredAt
          ? new Date(rule.lastFiredAt).getTime()
          : 0
        const elapsed = (now.getTime() - lastFired) / 60_000

        if (elapsed >= intervalMinutes) {
          messages.push({
            ruleId: rule.id,
            message: rule.message,
            trigger: rule.trigger,
          })
        }
      }

      if (rule.trigger === 'schedule') {
        const hour = condition.hour as number | undefined
        const minute = condition.minute as number | undefined
        if (hour !== undefined && minute !== undefined) {
          const nowH = now.getHours()
          const nowM = now.getMinutes()
          const alreadyFiredToday =
            rule.lastFiredAt &&
            new Date(rule.lastFiredAt).toDateString() === now.toDateString()

          if (nowH === hour && nowM === minute && !alreadyFiredToday) {
            messages.push({
              ruleId: rule.id,
              message: rule.message,
              trigger: rule.trigger,
            })
          }
        }
      }

      if (rule.trigger === 'event') {
        // Event-based triggers são disparados externamente via endpoint dedicado
        continue
      }
    }

    // Atualiza lastFiredAt das regras disparadas
    if (messages.length > 0) {
      await this.prisma.proactiveRule.updateMany({
        where: { id: { in: messages.map((m) => m.ruleId) } },
        data: { lastFiredAt: now },
      })
    }

    return messages
  }

  /**
   * Dispara regra de evento manualmente (ex.: quando um novo agendamento é criado).
   */
  async fireEventRule(userId: number, eventName: string) {
    const rules = await this.prisma.proactiveRule.findMany({
      where: { userId, isActive: true, trigger: 'event' },
    })

    const messages: { ruleId: number; message: string; trigger: string }[] = []

    for (const rule of rules) {
      const condition = rule.condition as Record<string, unknown>
      if (condition.event === eventName) {
        messages.push({
          ruleId: rule.id,
          message: rule.message,
          trigger: 'event',
        })
      }
    }

    if (messages.length > 0) {
      await this.prisma.proactiveRule.updateMany({
        where: { id: { in: messages.map((m) => m.ruleId) } },
        data: { lastFiredAt: new Date() },
      })
    }

    return messages
  }
}
