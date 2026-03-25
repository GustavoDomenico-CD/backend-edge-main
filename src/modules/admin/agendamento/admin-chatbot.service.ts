import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

type ChatbotSource = 'db' | 'api' | 'both';

type ApiReference = {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  tags: string[];
  description: string;
};

@Injectable()
export class AdminChatbotService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly apiReferences: ApiReference[] = [
    {
      method: 'GET',
      path: '/',
      tags: ['health', 'status'],
      description: 'Endpoint base da API.',
    },
    {
      method: 'POST',
      path: '/auth/register',
      tags: ['auth', 'register', 'cadastro'],
      description: 'Cria uma nova conta de usuario.',
    },
    {
      method: 'POST',
      path: '/auth/login',
      tags: ['auth', 'login'],
      description: 'Autenticacao de usuario.',
    },
    {
      method: 'GET',
      path: '/auth/profile',
      tags: ['auth', 'perfil', 'profile'],
      description: 'Retorna perfil do usuario autenticado.',
    },
    {
      method: 'GET',
      path: '/users',
      tags: ['users', 'usuario', 'list'],
      description: 'Lista usuarios (JWT necessario).',
    },
    {
      method: 'GET',
      path: '/users/:id',
      tags: ['users', 'usuario', 'detail'],
      description: 'Detalha um usuario por ID.',
    },
    {
      method: 'PATCH',
      path: '/users/:id',
      tags: ['users', 'usuario', 'update'],
      description: 'Atualiza dados de usuario.',
    },
    {
      method: 'DELETE',
      path: '/users/:id',
      tags: ['users', 'usuario', 'delete'],
      description: 'Remove usuario por ID.',
    },
    {
      method: 'GET',
      path: '/admin/agendamento/status',
      tags: ['admin', 'agendamento', 'status'],
      description: 'Status de integracoes.',
    },
    {
      method: 'GET',
      path: '/admin/agendamento/lista',
      tags: ['admin', 'agendamento', 'lista'],
      description: 'Lista agendamentos e charts.',
    },
    {
      method: 'GET',
      path: '/admin/agendamento/kpis',
      tags: ['admin', 'agendamento', 'kpi'],
      description: 'KPIs de agendamento.',
    },
  ];

  async searchInfo(query: string, source: ChatbotSource = 'both') {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return {
        query,
        source,
        db: [],
        api: [],
      };
    }

    const includeDb = source === 'db' || source === 'both';
    const includeApi = source === 'api' || source === 'both';

    const [db, api] = await Promise.all([
      includeDb
        ? this.searchDb(normalized)
        : Promise.resolve([] as Awaited<ReturnType<typeof this.searchDb>>),
      includeApi ? Promise.resolve(this.searchApi(normalized)) : Promise.resolve([]),
    ]);

    return {
      query,
      source,
      db,
      api,
    };
  }

  private async searchDb(normalizedQuery: string) {
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: normalizedQuery } },
          { name: { contains: normalizedQuery } },
          { phone: { contains: normalizedQuery } },
          { role: { contains: normalizedQuery } },
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { id: 'desc' },
      take: 20,
    });

    return users;
  }

  private searchApi(normalizedQuery: string) {
    return this.apiReferences.filter((endpoint) => {
      const haystack = [
        endpoint.method,
        endpoint.path,
        endpoint.description,
        endpoint.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }
}
