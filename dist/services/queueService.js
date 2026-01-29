"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueService = void 0;
const bull_1 = __importDefault(require("bull"));
const config_1 = require("../config");
class QueueService {
    constructor() {
        const queueConfig = config_1.config.redisUrl
            ? { redis: config_1.config.redisUrl }
            : {};
        this.missedCallQueue = new bull_1.default('missed-calls', queueConfig);
        this.voicemailQueue = new bull_1.default('voicemails', queueConfig);
        this.salesCallQueue = new bull_1.default('sales-calls', queueConfig);
        console.log(`✓ Queue service initialized (${config_1.config.redisUrl ? 'Redis' : 'In-memory'})`);
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
}
exports.QueueService = QueueService;
//# sourceMappingURL=queueService.js.map