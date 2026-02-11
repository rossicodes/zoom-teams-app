import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { config } from '../config';
import axios from 'axios';
import { SalesLeadItem, SalesCallItem } from '../types';

export class GraphService {
  private client: Client;
  private credential: ClientSecretCredential;
  private graphAccessToken: string | null = null;
  private graphAccessTokenExpiry: number = 0;

  constructor() {
    // Use ClientSecretCredential for App Registration
    this.credential = new ClientSecretCredential(
      config.tenantId,
      config.applicationId,
      config.clientSecret
    );

    this.client = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => {
          return this.getGraphAccessToken();
        },
      },
    });

    console.log('✓ Graph service initialized with App Registration');
  }

  private async getGraphAccessToken(): Promise<string> {
    // Reuse token with a 2-minute safety buffer
    if (
      this.graphAccessToken &&
      Date.now() < this.graphAccessTokenExpiry - 120000
    ) {
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
    } catch (error: any) {
      console.warn(
        `⚠ ClientSecretCredential token acquisition failed (${error?.code || error?.name || 'unknown'}): ${error?.message}`
      );
      console.warn('⚠ Falling back to direct OAuth token request for Graph.');
      return this.getGraphAccessTokenDirect();
    }
  }

  private async getGraphAccessTokenDirect(): Promise<string> {
    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(
      config.tenantId
    )}/oauth2/v2.0/token`;

    const requestBody = new URLSearchParams({
      client_id: config.applicationId,
      client_secret: config.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }).toString();

    try {
      const response = await axios.post(tokenUrl, requestBody, {
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
    } catch (error: any) {
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

  async createSalesLeadItem(item: SalesLeadItem): Promise<{ id: string, plannerTaskId?: string }> {
    try {
      // Idempotency check: Try to find existing item with this CallId
      if (item.callId) {
        const existingItems = await this.client
          .api(`/sites/${config.sharePointSiteId}/lists/${config.salesLeadsListId}/items`)
          .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
          .filter(`fields/CallId eq '${item.callId}'`)
          .expand('fields')
          .get();

        if (existingItems.value && existingItems.value.length > 0) {
          const foundId = existingItems.value[0].id; // Use const string directly
          const foundFields = existingItems.value[0].fields;
          const foundPlannerTaskId = foundFields?.PlannerTaskId;

          console.log(`✓ Check found existing item: ${foundId}`);
          if (foundPlannerTaskId) {
            console.log(`  > Found associated Planner Task ID: ${foundPlannerTaskId}`);
          }

          // If we have a transcript, update it too
          if (item.transcript) {
            console.log(`Updating existing item ${foundId} with transcript...`);
            await this.client
              .api(`/sites/${config.sharePointSiteId}/lists/${config.salesLeadsListId}/items/${foundId}/fields`)
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
          VoicemailTranscript: item.transcript || '', // Writing to new Multi-line Text column
        } as any,
      };

      // Add owner if provided
      if (item.owner && item.owner.length > 0) {
        listItem.fields.Owner = item.owner;
      }

      console.log('Preparing to create Sales Lead item:', JSON.stringify(listItem, null, 2));

      const result = await this.client
        .api(`/sites/${config.sharePointSiteId}/lists/${config.salesLeadsListId}/items`)
        .post(listItem);

      console.log(`✓ Created Sales Lead list item: ${result.id}`);
      return { id: result.id };
    } catch (error: any) {
      console.error('Error creating sales lead item:', error.message);
      if (error.body) {
        console.error('Graph API Error Body:', JSON.stringify(error.body, null, 2));
      }
      console.error('Full Error Object:', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  async createSalesCallItem(item: SalesCallItem): Promise<string> {
    try {
      // Idempotency check: Try to find existing item with this CallId
      if (item.callId) {
        const existingItems = await this.client
          .api(`/sites/${config.sharePointSiteId}/lists/${config.salesCallsListId}/items`)
          .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
          .filter(`fields/CallId eq '${item.callId}'`)
          .select('id')
          .get();

        if (existingItems.value && existingItems.value.length > 0) {
          const foundId = existingItems.value[0].id;
          console.log(`✓ Check found existing item: ${foundId}`);

          // Update if we have new links or status
          const updates: any = {};
          if (item.recordingLink) updates.RecordingUrl = item.recordingLink;
          if (item.transcript) updates.TranscriptUrl = item.transcript; // User changed this to Multi-line Text
          if (item.aiSummary) updates.AiSummary = item.aiSummary;
          if (item.status) updates.Status = item.status;

          if (Object.keys(updates).length > 0) {
            console.log(`Updating existing item ${foundId} with new details...`);
            await this.client
              .api(`/sites/${config.sharePointSiteId}/lists/${config.salesCallsListId}/items/${foundId}/fields`)
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
          TranscriptUrl: item.transcript || '', // Content now
          AiSummary: item.aiSummary || '',
        } as any,
      };

      // Add owner if provided
      if (item.owner && item.owner.length > 0) {
        listItem.fields.Owner = item.owner;
      }

      const result = await this.client
        .api(`/sites/${config.sharePointSiteId}/lists/${config.salesCallsListId}/items`)
        .post(listItem);

      console.log(`✓ Created Sales Call list item: ${result.id}`);
      return result.id;
    } catch (error: any) {
      console.error('Error creating sales call item:', error.message);
      throw error;
    }
  }

  async createPlannerTask(title: string, details: string, dueDate?: Date, existingTaskId?: string): Promise<string> {
    try {
      let taskId = existingTaskId;

      if (!taskId) {
        // Create new task if no ID provided
        const task: any = {
          planId: config.plannerPlanId,
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
      } else {
        console.log(`✓ Using existing Planner task: ${taskId}`);
      }

      // Update task details (description) with retry logic
      if (details && taskId) {
        let retries = 3;
        while (retries > 0) {
          try {
            // Get the details FIRST to get the correct ETag for details
            const taskDetails = await this.client
              .api(`/planner/tasks/${taskId}/details`)
              .get();

            let newDescription = details;

            // If updating existing task, append to existing description
            if (existingTaskId && taskDetails.description) {
              newDescription = taskDetails.description + '\n\n-------------------\n\n' + details;
            }

            await this.client
              .api(`/planner/tasks/${taskId}/details`)
              .header('If-Match', taskDetails['@odata.etag'])
              .header('Prefer', 'return=representation') // Good practice for Planner
              .patch({
                description: newDescription,
              });
            break; // Success
          } catch (err: any) {
            console.warn(`! Planner update failed (attempt ${4 - retries}): ${err.message}`);
            retries--;
            if (retries === 0) throw err;
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }
      }

      return taskId!;
    } catch (error: any) {
      console.error('Error creating planner task:', error.message);
      throw error;
    }
  }

  async updateSalesLeadPlannerTaskId(itemId: string, plannerTaskId: string): Promise<void> {
    try {
      await this.client
        .api(`/sites/${config.sharePointSiteId}/lists/${config.salesLeadsListId}/items/${itemId}/fields`)
        .patch({
          PlannerTaskId: plannerTaskId
        });
      console.log(`✓ Linked Planner Task ${plannerTaskId} to Sales Lead Item ${itemId}`);
    } catch (error: any) {
      console.error('Error linking Planner Task to Sales Lead:', error.message);
      // Soft fail, don't throw
    }
  }

  async postToTeamsChannel(message: string): Promise<void> {
    if (!config.teamsWebhookUrl) {
      console.warn('⚠ No TEAMS_WEBHOOK_URL configured. Skipping Teams notification.');
      return;
    }

    try {
      // Use Incoming Webhook for simple and reliable notifications
      // "message" here is expected to be HTML, but Webhooks mainly support JSON cards.
      // We will wrap the HTML message in a simple card format.

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

      // Sending Adaptive Card payload
      const response = await axios.post(config.teamsWebhookUrl, payload);

      console.log(`✓ Posted webhook message to Teams channel (Status: ${response.status} ${response.statusText})`);
    } catch (error: any) {
      console.error('Error posting to Teams Webhook:', error.message);
      // Don't throw, just log
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test by trying to get the site
      const site = await this.client
        .api(`/sites/${config.sharePointSiteId}`)
        .get();

      console.log(`✓ Graph API connection successful - Site: ${site.displayName}`);
      return true;
    } catch (error: any) {
      console.error('✗ Graph API connection failed:', error.message);
      return false;
    }
  }
}
