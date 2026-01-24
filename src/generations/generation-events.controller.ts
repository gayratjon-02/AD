import { Controller, Get, Param, Sse, UseGuards, Query, UnauthorizedException } from '@nestjs/common';
import { Observable, Subject, filter, map } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../database/entities/user.entity';
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
  async streamGenerationProgress(
    @Param('id') generationId: string,
    @Query('token') token: string,
  ): Promise<Observable<any>> {
    if (!token) {
      throw new UnauthorizedException('Token is required');
    }

    try {
      const payload = this.jwtService.verify(token);
      const userId = payload.sub;

      return this.generationsService.getGenerationEventStream().pipe(
        filter(
          (event) =>
            event.generationId === generationId && event.userId === userId,
        ),
        map((event) => ({
          data: JSON.stringify(event),
        })),
      );
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}