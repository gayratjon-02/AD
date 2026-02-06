import { Controller, Get, Param, Sse, UseGuards, Query, UnauthorizedException } from '@nestjs/common';
import { Observable, Subject, filter, map } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { User } from '../database/entities/Product-Visuals/user.entity';
import { GenerationsService } from './generations.service';
import { JwtService } from '@nestjs/jwt';

export interface GenerationEvent {
  type: 'visual_processing' | 'visual_completed' | 'visual_failed' | 'generation_completed';
  generationId: string;
  visualIndex?: number;
  visualType?: string;
  visual?: {
    type: string;
    status: string;
    image_url?: string;
    generated_at?: string;
    prompt?: string;
  };
  error?: string;
  completedCount?: number;
  totalCount?: number;
  timestamp: string;
  userId: string;
}

@Controller('generations')
export class GenerationEventsController {
  constructor(
    private readonly generationsService: GenerationsService,
    private readonly jwtService: JwtService,
  ) {}

  @Sse(':id/stream')
  @Public() // Public endpoint but we validate token manually
  async streamGenerationProgress(
    @Param('id') generationId: string,
    @Query('token') token: string,
  ): Promise<Observable<any>> {
    console.log(`🔗 SSE Connection attempt for generation: ${generationId}`);
    
    // Validate token and extract user ID
    let userId: string | null = null;
    try {
      if (token) {
        const payload = this.jwtService.verify(token);
        userId = payload.sub || payload.userId || payload.id;
        console.log(`✅ SSE: Authenticated user ${userId} for generation ${generationId}`);
      } else {
        console.warn(`⚠️ SSE: No token provided for generation ${generationId}`);
      }
    } catch (error) {
      console.error(`❌ SSE: Invalid token for generation ${generationId}:`, error);
      // Don't throw - allow connection but filter events by generationId only
    }

    return this.generationsService.getGenerationEventStream().pipe(
      filter((event) => {
        // Match by generationId and userId (if authenticated)
        const match = event.generationId === generationId && 
          (!userId || event.userId === userId);
        if (match) {
          console.log(`📨 SSE: Sending event to client:`, {
            type: event.type,
            visualIndex: event.visualIndex,
            hasImageUrl: !!event.visual?.image_url,
            imageUrlPreview: event.visual?.image_url ? event.visual.image_url.substring(0, 50) + '...' : 'none'
          });
        }
        return match;
      }),
      map((event) => {
        console.log(`🎯 SSE: Mapped event for transmission:`, {
          type: event.type,
          visualIndex: event.visualIndex,
          hasImageUrl: !!event.visual?.image_url
        });
        return {
          data: JSON.stringify(event),
        };
      }),
    );
  }
}