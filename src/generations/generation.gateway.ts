import {
	WebSocketGateway,
	WebSocketServer,
	SubscribeMessage,
	OnGatewayConnection,
	OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';

const ROOM_PREFIX = 'gen:';

@WebSocketGateway(0, {
	cors: { origin: '*' },
	namespace: '/generations',
})
export class GenerationGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server!: Server;

	private readonly logger = new Logger(GenerationGateway.name);

	handleConnection(client: any) {
		this.logger.log(`🔌 [Socket] Client connected: ${client.id}`);
	}

	handleDisconnect(client: any) {
		this.logger.log(`🔌 [Socket] Client disconnected: ${client.id}`);
	}

	@SubscribeMessage('subscribe')
	handleSubscribe(client: any, payload: { generationId: string }) {
		const { generationId } = payload || {};
		if (!generationId) {
			this.logger.warn(`⚠️ [Socket] Subscribe without generationId from ${client.id}`);
			return;
		}
		const room = ROOM_PREFIX + generationId;
		client.join(room);
		this.logger.log(`✅ [Socket] Client ${client.id} joined room ${room}`);
	}

	@SubscribeMessage('unsubscribe')
	handleUnsubscribe(client: any, payload: { generationId: string }) {
		const { generationId } = payload || {};
		if (!generationId) return;
		client.leave(ROOM_PREFIX + generationId);
	}

	/** Emit to all clients watching this generation. Call from processor. */
	emitToGeneration(generationId: string, event: string, data: any) {
		const room = ROOM_PREFIX + generationId;
		const clients = this.server.sockets.adapter.rooms.get(room);
		const clientCount = clients ? clients.size : 0;
		this.logger.log(`📡 [Socket] Emitting '${event}' to room ${room} (${clientCount} clients)`);
		this.server.to(room).emit(event, data);
	}

	/** Visual completed – real-time card update */
	emitVisualCompleted(
		generationId: string,
		payload: {
			type: string;
			index: number;
			image_url: string;
			generated_at: string;
			prompt?: string;
			status: 'completed' | 'failed';
			error?: string;
		},
	) {
		this.emitToGeneration(generationId, 'visual_completed', payload);
	}

	/** Progress update – elapsed, remaining, percent, counts */
	emitProgress(
		generationId: string,
		payload: {
			progress_percent: number;
			completed: number;
			total: number;
			elapsed_seconds: number;
			estimated_remaining_seconds?: number;
		},
	) {
		this.emitToGeneration(generationId, 'generation_progress', payload);
	}

	/** Generation finished */
	emitComplete(
		generationId: string,
		payload: {
			status: 'completed' | 'failed';
			completed: number;
			total: number;
			visuals: any[];
		},
	) {
		this.emitToGeneration(generationId, 'generation_complete', payload);
	}
}
