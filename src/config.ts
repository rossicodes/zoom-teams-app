import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Azure AD
  applicationId: process.env.APPLICATION_ID!,
  tenantId: process.env.TENANT_ID!,
  clientSecret: process.env.CLIENT_SECRET_VALUE!,

  // Microsoft 365
  sharePointSiteId: process.env.SHAREPOINT_SITE_ID!,
  salesLeadsListId: process.env.SALES_LEADS_LIST_ID!,
  salesCallsListId: process.env.SALES_CALLS_LIST_ID!,
  teamsTeamId: process.env.TEAMS_TEAM_ID!,
  teamsChannelId: '19:-Sy4ICzpNIb9votYqJtgHXVsMLCBnB0DeE-4KlgBrys1@thread.tacv2', // Sales & Marketing General Channel
  teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL, // Optional for now, but required for notifications to work without App permissions
  plannerPlanId: process.env.PLANNER_PLAN_ID!,

  // Zoom
  zoomAccountId: process.env.ZOOM_ACCOUNT_ID!,
  zoomClientId: process.env.ZOOM_CLIENT_ID!,
  zoomClientSecret: process.env.ZOOM_CLIENT_SECRET!,
  zoomWebhookSecretToken: process.env.ZOOM_WEBHOOK_SECRET_TOKEN!,

  // Redis (optional)
  redisUrl: process.env.REDIS_URL,
};

// Validation
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

console.log('✓ Configuration loaded successfully');
