import {
    Injectable,
    ConflictException,
    NotFoundException,
    Logger,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../database/prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto';

@Injectable()
export class UsersService {
    private readonly logger = new Logger(UsersService.name);

    constructor(private readonly prisma: PrismaService) { }

    async findAll() {
        const users = await this.prisma.user.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        return users;
    }

    async findById(id: string) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!user) {
            throw new NotFoundException(`User with id ${id} not found`);
        }

        return user;
    }

    async create(createUserDto: CreateUserDto) {
        const existing = await this.prisma.user.findUnique({
            where: { email: createUserDto.email },
        });

        if (existing) {
            throw new ConflictException('Email already in use');
        }

        const passwordHash = await argon2.hash(createUserDto.password);

        const user = await this.prisma.user.create({
            data: {
                email: createUserDto.email,
                passwordHash,
                name: createUserDto.name,
                role: createUserDto.role,
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                createdAt: true,
            },
        });

        this.logger.log(`User created: ${user.email}`);
        return user;
    }

    async update(id: string, updateUserDto: UpdateUserDto) {
        await this.findById(id);

        const data: any = { ...updateUserDto };

        if (updateUserDto.password) {
            data.passwordHash = await argon2.hash(updateUserDto.password);
            delete data.password;
        }

        const user = await this.prisma.user.update({
            where: { id },
            data,
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                updatedAt: true,
            },
        });

        this.logger.log(`User updated: ${user.email}`);
        return user;
    }

    async remove(id: string) {
        await this.findById(id);

        await this.prisma.user.delete({ where: { id } });

        this.logger.log(`User deleted: ${id}`);
        return { message: 'User deleted successfully' };
    }
}
