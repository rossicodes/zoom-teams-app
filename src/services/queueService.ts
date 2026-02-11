import Queue from 'bull';
import { config } from '../config';
import { QueueJob } from '../types';

type QueueJobLike<T> = {
  id: number | string;
  data: T;
};

type QueueHandler<T> = (job: any) => Promise<void> | void;
type QueueListener = (...args: any[]) => void;

export interface QueueLike<T> {
  add(data: T, options?: Queue.JobOptions): Promise<unknown>;
  process(handler: QueueHandler<T>): void;
  on(event: 'completed' | 'failed' | 'error', listener: QueueListener): void;
  getJobCounts(): Promise<any>;
}

class InMemoryQueue<T> implements QueueLike<T> {
  private nextId = 1;
  private handler: QueueHandler<T> | null = null;
  private pending: Array<{ job: QueueJobLike<T>; options: Queue.JobOptions }> = [];
  private listeners: Record<'completed' | 'failed' | 'error', QueueListener[]> = {
    completed: [],
    failed: [],
    error: [],
  };
  private counts = {
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
    paused: 0,
  };

  async add(data: T, options: Queue.JobOptions = {}): Promise<unknown> {
    const job: QueueJobLike<T> = { id: this.nextId++, data };

    if (!this.handler) {
      this.pending.push({ job, options });
      this.counts.waiting = this.pending.length;
      return;
    }

    this.counts.waiting += 1;
    void this.execute(job, options);
  }

  process(handler: QueueHandler<T>): void {
    this.handler = handler;

    if (this.pending.length === 0) {
      return;
    }

    const queued = [...this.pending];
    this.pending = [];
    this.counts.waiting = queued.length;

    for (const item of queued) {
      void this.execute(item.job, item.options);
    }
  }

  on(event: 'completed' | 'failed' | 'error', listener: QueueListener): void {
    this.listeners[event].push(listener);
  }

  async getJobCounts(): Promise<any> {
    return { ...this.counts };
  }

  private async execute(job: QueueJobLike<T>, options: Queue.JobOptions): Promise<void> {
    this.counts.waiting = Math.max(0, this.counts.waiting - 1);
    this.counts.active += 1;

    const attempts = Math.max(1, options.attempts ?? 1);
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        if (!this.handler) {
          throw new Error('Queue processor is not configured');
        }

        await this.handler(job);
        this.counts.active = Math.max(0, this.counts.active - 1);
        this.counts.completed += 1;
        this.listeners.completed.forEach((listener) => listener(job));
        return;
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < attempts) {
          const delay = this.getBackoffDelay(options.backoff, attempt);
          if (delay > 0) {
            this.counts.delayed += 1;
            await this.sleep(delay);
            this.counts.delayed = Math.max(0, this.counts.delayed - 1);
          }
        }
      }
    }

    this.counts.active = Math.max(0, this.counts.active - 1);
    this.counts.failed += 1;
    const error = lastError ?? new Error('Queue job failed');
    this.listeners.failed.forEach((listener) => listener(job, error));
    this.listeners.error.forEach((listener) => listener(error));
  }

  private getBackoffDelay(backoff: Queue.JobOptions['backoff'], attempt: number): number {
    if (!backoff) {
      return 0;
    }

    if (typeof backoff === 'number') {
      return backoff;
    }

    const baseDelay = typeof backoff.delay === 'number' ? backoff.delay : 0;
    if (backoff.type === 'exponential') {
      return baseDelay * 2 ** (attempt - 1);
    }

    return baseDelay;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export class QueueService {
  private missedCallQueue: QueueLike<QueueJob>;
  private voicemailQueue: QueueLike<QueueJob>;
  private salesCallQueue: QueueLike<QueueJob>;

  constructor() {
    const useRedis = this.shouldUseRedis(config.redisUrl);

    if (useRedis) {
      const queueConfig = { redis: config.redisUrl! };
      const missedCallsQueue = new Queue<QueueJob>('missed-calls', queueConfig);
      const voicemailsQueue = new Queue<QueueJob>('voicemails', queueConfig);
      const salesCallsQueue = new Queue<QueueJob>('sales-calls', queueConfig);

      this.missedCallQueue = missedCallsQueue;
      this.voicemailQueue = voicemailsQueue;
      this.salesCallQueue = salesCallsQueue;

      this.attachRedisErrorLogging(missedCallsQueue, 'missed-calls');
      this.attachRedisErrorLogging(voicemailsQueue, 'voicemails');
      this.attachRedisErrorLogging(salesCallsQueue, 'sales-calls');

      console.log('✓ Queue service initialized (Redis)');
      return;
    }

    this.missedCallQueue = new InMemoryQueue<QueueJob>();
    this.voicemailQueue = new InMemoryQueue<QueueJob>();
    this.salesCallQueue = new InMemoryQueue<QueueJob>();
    console.log('✓ Queue service initialized (In-memory fallback)');
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

  getMissedCallQueue(): QueueLike<QueueJob> {
    return this.missedCallQueue;
  }

  getVoicemailQueue(): QueueLike<QueueJob> {
    return this.voicemailQueue;
  }

  getSalesCallQueue(): QueueLike<QueueJob> {
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

  private shouldUseRedis(redisUrl?: string): boolean {
    if (!redisUrl) {
      return false;
    }

    const lowerUrl = redisUrl.toLowerCase();
    if (lowerUrl.includes('localhost') || lowerUrl.includes('127.0.0.1')) {
      console.warn('⚠ REDIS_URL points to localhost. Using in-memory fallback queue.');
      return false;
    }

    return true;
  }

  private attachRedisErrorLogging(queue: Queue.Queue<QueueJob>, queueName: string): void {
    queue.on('error', (err: Error) => {
      console.error(`✗ Redis queue error (${queueName}): ${err.message}`);
    });
  }
}
