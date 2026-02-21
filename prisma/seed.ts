import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@amagi.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123456';
    const adminName = process.env.ADMIN_NAME || 'Administrator';

    const existingAdmin = await prisma.user.findUnique({
        where: { email: adminEmail },
    });

    if (existingAdmin) {
        console.log(`Admin user already exists: ${adminEmail}`);
        return;
    }

    const passwordHash = await argon2.hash(adminPassword);

    const admin = await prisma.user.create({
        data: {
            email: adminEmail,
            passwordHash,
            name: adminName,
            role: Role.ADMIN,
            isActive: true,
        },
    });

    console.log(`Admin user created: ${admin.email} (${admin.id})`);
}

main()
    .catch((e) => {
        console.error('Seed error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
