"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphService = void 0;
const microsoft_graph_client_1 = require("@microsoft/microsoft-graph-client");
const identity_1 = require("@azure/identity");
const config_1 = require("../config");
const axios_1 = __importDefault(require("axios"));
class GraphService {
    constructor() {
        this.graphAccessToken = null;
        this.graphAccessTokenExpiry = 0;
        this.credential = new identity_1.ClientSecretCredential(config_1.config.tenantId, config_1.config.applicationId, config_1.config.clientSecret);
        this.client = microsoft_graph_client_1.Client.initWithMiddleware({
            authProvider: {
                getAccessToken: async () => {
                    return this.getGraphAccessToken();
                },
            },
        });
        console.log('✓ Graph service initialized with App Registration');
    }
    async getGraphAccessToken() {
        if (this.graphAccessToken &&
            Date.now() < this.graphAccessTokenExpiry - 120000) {
            return this.graphAccessToken;
        }
        try {
            const token = await this.credential.getToken('https://graph.microsoft.com/.default');
            if (!token?.token) {
                throw new Error('Empty token returned by ClientSecretCredential');
            }
            this.graphAccessToken = token.token;
            this.graphAccessTokenExpiry = token.expiresOnTimestamp || Date.now() + 3600 * 1000;
            return this.graphAccessToken;
        }
        catch (error) {
            console.warn(`⚠ ClientSecretCredential token acquisition failed (${error?.code || error?.name || 'unknown'}): ${error?.message}`);
            console.warn('⚠ Falling back to direct OAuth token request for Graph.');
            return this.getGraphAccessTokenDirect();
        }
    }
    async getGraphAccessTokenDirect() {
        const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(config_1.config.tenantId)}/oauth2/v2.0/token`;
        const requestBody = new URLSearchParams({
            client_id: config_1.config.applicationId,
            client_secret: config_1.config.clientSecret,
            scope: 'https://graph.microsoft.com/.default',
            grant_type: 'client_credentials',
        }).toString();
        try {
            const response = await axios_1.default.post(tokenUrl, requestBody, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                timeout: 10000,
            });
            const accessToken = response.data?.access_token;
            const expiresIn = Number(response.data?.expires_in || 3600);
            if (!accessToken) {
                throw new Error('Token endpoint response missing access_token');
            }
            this.graphAccessToken = accessToken;
            this.graphAccessTokenExpiry = Date.now() + expiresIn * 1000;
            console.log('✓ Acquired Graph access token via direct OAuth endpoint');
            return accessToken;
        }
        catch (error) {
            const status = error?.response?.status;
            const data = error?.response?.data;
            if (status) {
                console.error(`✗ Direct OAuth token request failed (HTTP ${status})`);
            }
            if (data) {
                console.error('OAuth error response:', JSON.stringify(data));
            }
            throw error;
        }
    }
    async createSalesLeadItem(item) {
        try {
            if (item.callId) {
                const existingItems = await this.client
                    .api(`/sites/${config_1.config.sharePointSiteId}/lists/${config_1.config.salesLeadsListId}/items`)
                    .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
                    .filter(`fields/CallId eq '${item.callId}'`)
                    .expand('fields')
                    .get();
                if (existingItems.value && existingItems.value.length > 0) {
                    const foundId = existingItems.value[0].id;
                    const foundFields = existingItems.value[0].fields;
                    const foundPlannerTaskId = foundFields?.PlannerTaskId;
                    console.log(`✓ Check found existing item: ${foundId}`);
                    if (foundPlannerTaskId) {
                        console.log(`  > Found associated Planner Task ID: ${foundPlannerTaskId}`);
                    }
                    if (item.transcript) {
                        console.log(`Updating existing item ${foundId} with transcript...`);
                        await this.client
                            .api(`/sites/${config_1.config.sharePointSiteId}/lists/${config_1.config.salesLeadsListId}/items/${foundId}/fields`)
                            .patch({
                            VoicemailTranscript: item.transcript
                        });
                        console.log(`✓ Updated VoicemailTranscript for item ${foundId}`);
                    }
                    return { id: foundId, plannerTaskId: foundPlannerTaskId };
                }
            }
            const listItem = {
                fields: {
                    Title: item.summary,
                    Channel: item.channel,
                    Priority: item.priority,
                    Status: item.status,
                    CallTimestamp: item.callTimestamp,
                    CallId: item.callId,
                    VoicemailTranscript: item.transcript || '',
                },
            };
            if (item.owner && item.owner.length > 0) {
                listItem.fields.Owner = item.owner;
            }
            console.log('Preparing to create Sales Lead item:', JSON.stringify(listItem, null, 2));
            const result = await this.client
                .api(`/sites/${config_1.config.sharePointSiteId}/lists/${config_1.config.salesLeadsListId}/items`)
                .post(listItem);
            console.log(`✓ Created Sales Lead list item: ${result.id}`);
            return { id: result.id };
        }
        catch (error) {
            console.error('Error creating sales lead item:', error.message);
            if (error.body) {
                console.error('Graph API Error Body:', JSON.stringify(error.body, null, 2));
            }
            console.error('Full Error Object:', JSON.stringify(error, null, 2));
            throw error;
        }
    }
    async createSalesCallItem(item) {
        try {
            if (item.callId) {
                const existingItems = await this.client
                    .api(`/sites/${config_1.config.sharePointSiteId}/lists/${config_1.config.salesCallsListId}/items`)
                    .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
                    .filter(`fields/CallId eq '${item.callId}'`)
                    .select('id')
                    .get();
                if (existingItems.value && existingItems.value.length > 0) {
                    const foundId = existingItems.value[0].id;
                    console.log(`✓ Check found existing item: ${foundId}`);
                    const updates = {};
                    if (item.recordingLink)
                        updates.RecordingUrl = item.recordingLink;
                    if (item.transcript)
                        updates.TranscriptUrl = item.transcript;
                    if (item.aiSummary)
                        updates.AiSummary = item.aiSummary;
                    if (item.status)
                        updates.Status = item.status;
                    if (Object.keys(updates).length > 0) {
                        console.log(`Updating existing item ${foundId} with new details...`);
                        await this.client
                            .api(`/sites/${config_1.config.sharePointSiteId}/lists/${config_1.config.salesCallsListId}/items/${foundId}/fields`)
                            .patch(updates);
                        console.log(`✓ Updated details for item ${foundId}`);
                    }
                    return foundId;
                }
            }
            const listItem = {
                fields: {
                    Title: item.summary,
                    Contact: item.contact,
                    Priority: item.priority,
                    Status: item.status,
                    CallTimestamp: item.callTimestamp,
                    CallId: item.callId,
                    Duration: item.duration,
                    RecordingUrl: item.recordingLink || '',
                    TranscriptUrl: item.transcript || '',
                    AiSummary: item.aiSummary || '',
                },
            };
            if (item.owner && item.owner.length > 0) {
                listItem.fields.Owner = item.owner;
            }
            const result = await this.client
                .api(`/sites/${config_1.config.sharePointSiteId}/lists/${config_1.config.salesCallsListId}/items`)
                .post(listItem);
            console.log(`✓ Created Sales Call list item: ${result.id}`);
            return result.id;
        }
        catch (error) {
            console.error('Error creating sales call item:', error.message);
            throw error;
        }
    }
    async createPlannerTask(title, details, dueDate, existingTaskId) {
        try {
            let taskId = existingTaskId;
            if (!taskId) {
                const task = {
                    planId: config_1.config.plannerPlanId,
                    title: title,
                };
                if (dueDate) {
                    task.dueDateTime = dueDate.toISOString();
                }
                const result = await this.client
                    .api('/planner/tasks')
                    .post(task);
                taskId = result.id;
                console.log(`✓ Created Planner task: ${taskId}`);
            }
            else {
                console.log(`✓ Using existing Planner task: ${taskId}`);
            }
            if (details && taskId) {
                let retries = 3;
                while (retries > 0) {
                    try {
                        const taskDetails = await this.client
                            .api(`/planner/tasks/${taskId}/details`)
                            .get();
                        let newDescription = details;
                        if (existingTaskId && taskDetails.description) {
                            newDescription = taskDetails.description + '\n\n-------------------\n\n' + details;
                        }
                        await this.client
                            .api(`/planner/tasks/${taskId}/details`)
                            .header('If-Match', taskDetails['@odata.etag'])
                            .header('Prefer', 'return=representation')
                            .patch({
                            description: newDescription,
                        });
                        break;
                    }
                    catch (err) {
                        console.warn(`! Planner update failed (attempt ${4 - retries}): ${err.message}`);
                        retries--;
                        if (retries === 0)
                            throw err;
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    }
                }
            }
            return taskId;
        }
        catch (error) {
            console.error('Error creating planner task:', error.message);
            throw error;
        }
    }
    async updateSalesLeadPlannerTaskId(itemId, plannerTaskId) {
        try {
            await this.client
                .api(`/sites/${config_1.config.sharePointSiteId}/lists/${config_1.config.salesLeadsListId}/items/${itemId}/fields`)
                .patch({
                PlannerTaskId: plannerTaskId
            });
            console.log(`✓ Linked Planner Task ${plannerTaskId} to Sales Lead Item ${itemId}`);
        }
        catch (error) {
            console.error('Error linking Planner Task to Sales Lead:', error.message);
        }
    }
    async postToTeamsChannel(message) {
        if (!config_1.config.teamsWebhookUrl) {
            console.warn('⚠ No TEAMS_WEBHOOK_URL configured. Skipping Teams notification.');
            return;
        }
        try {
            const payload = {
                type: "message",
                attachments: [
                    {
                        contentType: "application/vnd.microsoft.card.adaptive",
                        content: {
                            type: "AdaptiveCard",
                            body: [
                                {
                                    type: "TextBlock",
                                    text: "New Zoom Voicemail",
                                    weight: "Bolder",
                                    size: "Medium"
                                },
                                {
                                    type: "TextBlock",
                                    text: message
                                        .replace(/<br\s*\/?>/gi, "\n")
                                        .replace(/<\/p>/gi, "\n")
                                        .replace(/<[^>]*>/g, ""),
                                    wrap: true
                                },
                                {
                                    type: "TextBlock",
                                    text: "Please check Planner for details.",
                                    isSubtle: true,
                                    wrap: true
                                }
                            ],
                            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                            "version": "1.2"
                        }
                    }
                ]
            };
            const response = await axios_1.default.post(config_1.config.teamsWebhookUrl, payload);
            console.log(`✓ Posted webhook message to Teams channel (Status: ${response.status} ${response.statusText})`);
        }
        catch (error) {
            console.error('Error posting to Teams Webhook:', error.message);
        }
    }
    async testConnection() {
        try {
            const site = await this.client
                .api(`/sites/${config_1.config.sharePointSiteId}`)
                .get();
            console.log(`✓ Graph API connection successful - Site: ${site.displayName}`);
            return true;
        }
        catch (error) {
            console.error('✗ Graph API connection failed:', error.message);
            return false;
        }
    }
}
exports.GraphService = GraphService;
//# sourceMappingURL=graphService.js.map