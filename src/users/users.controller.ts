import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateUserDto } from '../libs/dto';
import { User } from '../database/entities/user.entity';
import { ClaudeService } from '../ai/claude.service';
import { VertexImagenService } from '../ai/vertex-imagen.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
	constructor(
		private readonly usersService: UsersService,
		private readonly claudeService: ClaudeService,
		private readonly vertexImagenService: VertexImagenService,
	) {}

	@Get('getUser')
	async getUser(@CurrentUser() user: User): Promise<Omit<User, 'password_hash'>> {
		return this.usersService.findOne(user.id);
	}

	@Get('getSettings')
	async getSettings(@CurrentUser() user: User): Promise<Partial<User>> {
		return this.usersService.getSettings(user.id);
	}

	@Post('updateUser')
	async updateUser(
		@CurrentUser() user: User,
		@Body() updateUserDto: UpdateUserDto,
	): Promise<Omit<User, 'password_hash'>> {
		return this.usersService.update(user.id, updateUserDto);
	}

	@Post('updateApiKey')
	async updateApiKey(
		@CurrentUser() user: User,
		@Body() body: { keyType: 'openai' | 'anthropic' | 'gemini'; apiKey: string | null },
	): Promise<{ success: boolean; message: string }> {
		return this.usersService.updateApiKey(user.id, body.keyType, body.apiKey);
	}

	@Get('getApiKeyStatus')
	async getApiKeyStatus(@CurrentUser() user: User): Promise<{
		anthropic: { hasSystemKey: boolean; hasUserKey: boolean; activeSource: string; model: string };
		vertex: { configured: boolean; model: string };
		gemini: { hasSystemKey: boolean; hasUserKey: boolean; activeSource: string; model: string };
	}> {
		const userSettings = await this.usersService.getUserApiKeys(user.id);
		const anthropicStatus = this.claudeService.getApiKeyStatus();
		const vertexConfigured = this.vertexImagenService.isConfigured();
		const vertexModel = this.vertexImagenService.getModelName();
		const anthropicModel = userSettings.claude_model || this.claudeService.getModel();
		const imagenModelOverride = userSettings.gemini_model || vertexModel;

		return {
			anthropic: {
				hasSystemKey: anthropicStatus.hasSystemKey,
				hasUserKey: !!userSettings.api_key_anthropic,
				activeSource: userSettings.api_key_anthropic ? 'user' : (anthropicStatus.hasSystemKey ? 'system' : 'none'),
				model: anthropicModel,
			},
			vertex: {
				configured: vertexConfigured,
				model: imagenModelOverride,
			},
			gemini: {
				hasSystemKey: false,
				hasUserKey: !!userSettings.api_key_gemini,
				activeSource: userSettings.api_key_gemini ? 'user' : 'none',
				model: imagenModelOverride,
			},
		};
	}
}
