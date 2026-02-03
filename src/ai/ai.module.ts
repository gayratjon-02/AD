import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClaudeService } from './claude.service';
import { GeminiService } from './gemini.service';
import { VertexImagenService } from './vertex-imagen.service';
import { PromptBuilderService } from './prompt-builder.service';

@Module({
	imports: [ConfigModule],
	providers: [ClaudeService, GeminiService, VertexImagenService, PromptBuilderService],
	exports: [ClaudeService, GeminiService, VertexImagenService, PromptBuilderService],
})
export class AiModule { }
