import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dns from 'dns/promises';
import https from 'https';
import { config } from './config';
import { createRoutes } from './routes';
import { QueueService } from './services/queueService';
import { QueueProcessor } from './services/queueProcessor';
import { ZoomService } from './services/zoomService';
import { GraphService } from './services/graphService';

class Server {
  private app: Express;
  private queueService: QueueService;
  private queueProcessor: QueueProcessor;
  private zoomService: ZoomService;
  private graphService: GraphService;

  constructor() {
    this.app = express();

    // Initialize services
    this.queueService = new QueueService();
    this.queueProcessor = new QueueProcessor();
    this.zoomService = new ZoomService();
    this.graphService = new GraphService();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupQueueProcessors();
  }

  private setupMiddleware(): void {
    // Security
    this.app.use(helmet());

    // CORS
    this.app.use(cors());

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    const routes = createRoutes(
      this.queueService,
      this.zoomService,
      this.graphService
    );

    this.app.use('/api', routes);

    // Root endpoint
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

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });

    // Error handler
    this.app.use((err: any, req: any, res: any, next: any) => {
      console.error('Server error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  private setupQueueProcessors(): void {
    // Process missed calls
    this.queueService.getMissedCallQueue().process(async (job) => {
      await this.queueProcessor.processMissedCall(job);
    });

    // Process voicemails
    this.queueService.getVoicemailQueue().process(async (job) => {
      await this.queueProcessor.processVoicemail(job);
    });

    // Process sales calls
    this.queueService.getSalesCallQueue().process(async (job) => {
      await this.queueProcessor.processSalesCall(job);
    });

    // Queue event handlers
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

  public async start(): Promise<void> {
    const port = config.port;

    this.app.listen(port, () => {
      console.log('\n===========================================');
      console.log('🚀 Zoom Teams Integration Server Started');
      console.log('===========================================');
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`Port: ${port}`);
      console.log(`URL: http://localhost:${port}`);
      console.log('\nEndpoints:');
      console.log(`  Health:     http://localhost:${port}/api/health`);
      console.log(`  Webhook:    http://localhost:${port}/api/webhook/zoom`);
      console.log(`  Log Call:   http://localhost:${port}/api/log-call`);
      console.log(`  Test Graph: http://localhost:${port}/api/test-graph`);
      console.log('===========================================\n');

      // Test Graph API connection on startup
      this.logProxyEnvironment();
      this.runNetworkDiagnostics().catch((err) => {
        console.error('⚠ Network diagnostics failed:', err.message);
      });

      this.graphService.testConnection().catch((err) => {
        console.error('⚠ Warning: Could not connect to Graph API:', err.message);
      });
    });
  }

  private logProxyEnvironment(): void {
    const proxyVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY'];
    const present = proxyVars.filter((name) => !!process.env[name]);

    if (present.length > 0) {
      console.warn(`⚠ Proxy environment variables detected: ${present.join(', ')}`);
    } else {
      console.log('✓ No proxy environment variables detected');
    }
  }

  private async runNetworkDiagnostics(): Promise<void> {
    const hosts = ['login.microsoftonline.com', 'graph.microsoft.com'];

    for (const host of hosts) {
      try {
        const result = await dns.lookup(host);
        console.log(`✓ DNS lookup ${host} -> ${result.address}`);
      } catch (error: any) {
        console.error(`✗ DNS lookup failed for ${host}: ${error.code || error.message}`);
      }
    }

    await this.probeHttps(
      'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration'
    );
    await this.probeHttps('https://graph.microsoft.com/v1.0/$metadata');
  }

  private async probeHttps(url: string): Promise<void> {
    await new Promise<void>((resolve) => {
      const req = https.get(url, { timeout: 5000 }, (res) => {
        console.log(`✓ HTTPS probe ${url} -> ${res.statusCode}`);
        res.resume();
        resolve();
      });

      req.on('timeout', () => {
        console.error(`✗ HTTPS probe timeout: ${url}`);
        req.destroy();
        resolve();
      });

      req.on('error', (error: any) => {
        console.error(`✗ HTTPS probe failed ${url}: ${error.code || error.message}`);
        resolve();
      });
    });
  }
}

// Start server
const server = new Server();
server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
