"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const config_1 = require("./config");
const routes_1 = require("./routes");
const queueService_1 = require("./services/queueService");
const queueProcessor_1 = require("./services/queueProcessor");
const zoomService_1 = require("./services/zoomService");
const graphService_1 = require("./services/graphService");
class Server {
    constructor() {
        this.app = (0, express_1.default)();
        this.queueService = new queueService_1.QueueService();
        this.queueProcessor = new queueProcessor_1.QueueProcessor();
        this.zoomService = new zoomService_1.ZoomService();
        this.graphService = new graphService_1.GraphService();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupQueueProcessors();
    }
    setupMiddleware() {
        this.app.use((0, helmet_1.default)());
        this.app.use((0, cors_1.default)());
        this.app.use(express_1.default.json());
        this.app.use(express_1.default.urlencoded({ extended: true }));
        this.app.use((req, res, next) => {
            console.log(`${req.method} ${req.path}`);
            next();
        });
    }
    setupRoutes() {
        const routes = (0, routes_1.createRoutes)(this.queueService, this.zoomService, this.graphService);
        this.app.use('/api', routes);
        this.app.get('/', (req, res) => {
            res.json({
                name: 'Zoom Teams Integration API',
                version: '1.0.0',
                endpoints: {
                    health: '/api/health',
                    webhook: '/api/webhook/zoom',
                    logCall: '/api/log-call',
                    queueStatus: '/api/queue-status',
                    testGraph: '/api/test-graph',
                },
            });
        });
        this.app.use((req, res) => {
            res.status(404).json({ error: 'Not found' });
        });
        this.app.use((err, req, res, next) => {
            console.error('Server error:', err);
            res.status(500).json({ error: 'Internal server error' });
        });
    }
    setupQueueProcessors() {
        this.queueService.getMissedCallQueue().process(async (job) => {
            await this.queueProcessor.processMissedCall(job);
        });
        this.queueService.getVoicemailQueue().process(async (job) => {
            await this.queueProcessor.processVoicemail(job);
        });
        this.queueService.getSalesCallQueue().process(async (job) => {
            await this.queueProcessor.processSalesCall(job);
        });
        this.queueService.getMissedCallQueue().on('completed', (job) => {
            console.log(`✓ Job ${job.id} completed`);
        });
        this.queueService.getMissedCallQueue().on('failed', (job, err) => {
            console.error(`✗ Job ${job?.id} failed:`, err.message);
        });
        this.queueService.getVoicemailQueue().on('completed', (job) => {
            console.log(`✓ Job ${job.id} completed`);
        });
        this.queueService.getVoicemailQueue().on('failed', (job, err) => {
            console.error(`✗ Job ${job?.id} failed:`, err.message);
        });
        this.queueService.getSalesCallQueue().on('completed', (job) => {
            console.log(`✓ Job ${job.id} completed`);
        });
        this.queueService.getSalesCallQueue().on('failed', (job, err) => {
            console.error(`✗ Job ${job?.id} failed:`, err.message);
        });
        console.log('✓ Queue processors initialized');
    }
    async start() {
        const port = config_1.config.port;
        this.app.listen(port, () => {
            console.log('\n===========================================');
            console.log('🚀 Zoom Teams Integration Server Started');
            console.log('===========================================');
            console.log(`Environment: ${config_1.config.nodeEnv}`);
            console.log(`Port: ${port}`);
            console.log(`URL: http://localhost:${port}`);
            console.log('\nEndpoints:');
            console.log(`  Health:     http://localhost:${port}/api/health`);
            console.log(`  Webhook:    http://localhost:${port}/api/webhook/zoom`);
            console.log(`  Log Call:   http://localhost:${port}/api/log-call`);
            console.log(`  Test Graph: http://localhost:${port}/api/test-graph`);
            console.log('===========================================\n');
            this.graphService.testConnection().catch((err) => {
                console.error('⚠ Warning: Could not connect to Graph API:', err.message);
            });
        });
    }
}
const server = new Server();
server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
//# sourceMappingURL=server.js.map