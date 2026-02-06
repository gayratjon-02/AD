import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from '../database/entities/Product-Visuals/user.entity';
import { AiModule } from '../ai/ai.module';

@Module({
	imports: [TypeOrmModule.forFeature([User]), AiModule],
	controllers: [UsersController],
	providers: [UsersService],
	exports: [UsersService],
})
export class UsersModule {}
