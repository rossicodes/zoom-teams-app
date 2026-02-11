"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueService = void 0;
const bull_1 = __importDefault(require("bull"));
const config_1 = require("../config");
class InMemoryQueue {
    constructor() {
        this.nextId = 1;
        this.handler = null;
        this.pending = [];
        this.listeners = {
            completed: [],
            failed: [],
            error: [],
        };
        this.counts = {
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0,
            paused: 0,
        };
    }
    async add(data, options = {}) {
        const job = { id: this.nextId++, data };
        if (!this.handler) {
            this.pending.push({ job, options });
            this.counts.waiting = this.pending.length;
            return;
        }
        this.counts.waiting += 1;
        void this.execute(job, options);
    }
    process(handler) {
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
    on(event, listener) {
        this.listeners[event].push(listener);
    }
    async getJobCounts() {
        return { ...this.counts };
    }
    async execute(job, options) {
        this.counts.waiting = Math.max(0, this.counts.waiting - 1);
        this.counts.active += 1;
        const attempts = Math.max(1, options.attempts ?? 1);
        let lastError = null;
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
            }
            catch (error) {
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
    getBackoffDelay(backoff, attempt) {
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
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
class QueueService {
    constructor() {
        const useRedis = this.shouldUseRedis(config_1.config.redisUrl);
        if (useRedis) {
            const queueConfig = { redis: config_1.config.redisUrl };
            const missedCallsQueue = new bull_1.default('missed-calls', queueConfig);
            const voicemailsQueue = new bull_1.default('voicemails', queueConfig);
            const salesCallsQueue = new bull_1.default('sales-calls', queueConfig);
            this.missedCallQueue = missedCallsQueue;
            this.voicemailQueue = voicemailsQueue;
            this.salesCallQueue = salesCallsQueue;
            this.attachRedisErrorLogging(missedCallsQueue, 'missed-calls');
            this.attachRedisErrorLogging(voicemailsQueue, 'voicemails');
            this.attachRedisErrorLogging(salesCallsQueue, 'sales-calls');
            console.log('✓ Queue service initialized (Redis)');
            return;
        }
        this.missedCallQueue = new InMemoryQueue();
        this.voicemailQueue = new InMemoryQueue();
        this.salesCallQueue = new InMemoryQueue();
        console.log('✓ Queue service initialized (In-memory fallback)');
    }
    async addMissedCall(job) {
        await this.missedCallQueue.add(job, {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 2000,
            },
        });
        console.log('→ Added missed call to queue');
    }
    async addVoicemail(job) {
        await this.voicemailQueue.add(job, {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 2000,
            },
        });
        console.log('→ Added voicemail to queue');
    }
    async addSalesCall(job) {
        await this.salesCallQueue.add(job, {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 2000,
            },
        });
        console.log('→ Added sales call to queue');
    }
    getMissedCallQueue() {
        return this.missedCallQueue;
    }
    getVoicemailQueue() {
        return this.voicemailQueue;
    }
    getSalesCallQueue() {
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
    shouldUseRedis(redisUrl) {
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
    attachRedisErrorLogging(queue, queueName) {
        queue.on('error', (err) => {
            console.error(`✗ Redis queue error (${queueName}): ${err.message}`);
        });
    }
}
exports.QueueService = QueueService;
//# sourceMappingURL=queueService.js.map