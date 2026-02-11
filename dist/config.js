"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    applicationId: process.env.APPLICATION_ID,
    tenantId: process.env.TENANT_ID,
    clientSecret: process.env.CLIENT_SECRET_VALUE,
    sharePointSiteId: process.env.SHAREPOINT_SITE_ID,
    salesLeadsListId: process.env.SALES_LEADS_LIST_ID,
    salesCallsListId: process.env.SALES_CALLS_LIST_ID,
    teamsTeamId: process.env.TEAMS_TEAM_ID,
    teamsChannelId: process.env.TEAMS_CHANNEL_ID,
    teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL,
    plannerPlanId: process.env.PLANNER_PLAN_ID,
    zoomAccountId: process.env.ZOOM_ACCOUNT_ID,
    zoomClientId: process.env.ZOOM_CLIENT_ID,
    zoomClientSecret: process.env.ZOOM_CLIENT_SECRET,
    zoomWebhookSecretToken: process.env.ZOOM_WEBHOOK_SECRET_TOKEN,
    redisUrl: process.env.REDIS_URL,
};
const requiredEnvVars = [
    'APPLICATION_ID',
    'TENANT_ID',
    'CLIENT_SECRET_VALUE',
    'SHAREPOINT_SITE_ID',
    'SALES_LEADS_LIST_ID',
    'TEAMS_TEAM_ID',
    'TEAMS_CHANNEL_ID',
    'ZOOM_ACCOUNT_ID',
    'ZOOM_CLIENT_ID',
    'ZOOM_CLIENT_SECRET',
    'ZOOM_WEBHOOK_SECRET_TOKEN',
];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
    }
}
if (!process.env.TEAMS_WEBHOOK_URL) {
    console.warn('⚠ TEAMS_WEBHOOK_URL is not set. Teams notifications will be skipped.');
}
if (!process.env.REDIS_URL) {
    console.warn('⚠ REDIS_URL is not set. Bull queues require Redis and will try localhost:6379.');
}
console.log('✓ Configuration loaded successfully');
//# sourceMappingURL=config.js.map