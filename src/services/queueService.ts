import Queue from 'bull';
import { config } from '../config';
import { QueueJob } from '../types';

export class QueueService {
  private missedCallQueue: Queue.Queue<QueueJob>;
  private voicemailQueue: Queue.Queue<QueueJob>;
  private salesCallQueue: Queue.Queue<QueueJob>;

  constructor() {
    // Use Redis if available, otherwise use in-memory
    const queueConfig = config.redisUrl
      ? { redis: config.redisUrl }
      : {}; // Bull will use in-memory if no Redis config

    this.missedCallQueue = new Queue<QueueJob>('missed-calls', queueConfig);
    this.voicemailQueue = new Queue<QueueJob>('voicemails', queueConfig);
    this.salesCallQueue = new Queue<QueueJob>('sales-calls', queueConfig);

    console.log(`✓ Queue service initialized (${config.redisUrl ? 'Redis' : 'In-memory'})`);
  }

  async addMissedCall(job: QueueJob): Promise<void> {
    await this.missedCallQueue.add(job, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });
    console.log('→ Added missed call to queue');
  }

  async addVoicemail(job: QueueJob): Promise<void> {
    await this.voicemailQueue.add(job, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });
    console.log('→ Added voicemail to queue');
  }

  async addSalesCall(job: QueueJob): Promise<void> {
    await this.salesCallQueue.add(job, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });
    console.log('→ Added sales call to queue');
  }

  getMissedCallQueue(): Queue.Queue<QueueJob> {
    return this.missedCallQueue;
  }

  getVoicemailQueue(): Queue.Queue<QueueJob> {
    return this.voicemailQueue;
  }

  getSalesCallQueue(): Queue.Queue<QueueJob> {
    return this.salesCallQueue;
  }

  async getQueueStats() {
    const [missedCallCounts, voicemailCounts, salesCallCounts] = await Promise.all([
      this.missedCallQueue.getJobCounts(),
      this.voicemailQueue.getJobCounts(),
      this.salesCallQueue.getJobCounts(),
    ]);

    return {
      missedCalls: missedCallCounts,
      voicemails: voicemailCounts,
      salesCalls: salesCallCounts,
    };
  }
}
