import {
    Injectable,
    OnModuleInit,
    OnModuleDestroy,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
    extends PrismaClient
    implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PrismaService.name);

    constructor(configService: ConfigService) {
        const pool = new Pool({
            connectionString: configService.get<string>('database.url'),
        });
        const adapter = new PrismaPg(pool);
        super({ adapter });
    }

    async onModuleInit() {
        await this.$connect();
        this.logger.log('Connected to PostgreSQL via Prisma');
    }

    async onModuleDestroy() {
        await this.$disconnect();
        this.logger.log('Disconnected from PostgreSQL');
    }
}
