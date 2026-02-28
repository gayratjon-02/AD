import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';

@Module({
	imports: [
		BullModule.registerQueue({
			name: 'packshot',
			settings: {
				stalledInterval: 300000,
				maxStalledCount: 3,
				lockDuration: 600000,
				lockRenewTime: 300000,
			},
			defaultJobOptions: {
				attempts: 2,
				timeout: 600000, // 10 minutes
				backoff: {
					type: 'exponential',
					delay: 5000,
				},
				removeOnComplete: {
					age: 3600,
					count: 100,
				},
				removeOnFail: {
					age: 86400,
				},
			},
		}),
	],
	exports: [BullModule],
})
export class PackshotQueueModule {}
