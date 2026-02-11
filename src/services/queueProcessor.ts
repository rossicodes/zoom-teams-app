import { ZoomService } from '../services/zoomService';
import { GraphService } from '../services/graphService';
import { QueueJob, SalesLeadItem, SalesCallItem } from '../types';

type ProcessJob = {
  id?: string | number;
  data: QueueJob;
};

export class QueueProcessor {
  private zoomService: ZoomService;
  private graphService: GraphService;

  constructor() {
    this.zoomService = new ZoomService();
    this.graphService = new GraphService();
  }

  async processMissedCall(job: ProcessJob): Promise<void> {
    console.log(`\n🔔 Processing missed call job ${job.id}`);

    try {
      const event = job.data.event;
      const callObj = event.payload.object as any;

      console.log(`→ Call ID: ${callObj.call_id}`);

      // Extract details directly from webhook payload
      // No need to call Zoom API which might 404
      const callerName = callObj.caller.name || callObj.caller.phone_number || 'Unknown';
      const callerPhone = callObj.caller.phone_number || 'Unknown';
      const callTime = callObj.date_time || callObj.ringing_start_time || new Date().toISOString();
      const duration = callObj.duration || 0;

      // Prepare Sales Lead item
      const leadItem: SalesLeadItem = {
        channel: 'Zoom Phone',
        summary: `Missed call from ${callerName}`,
        priority: 'High',
        status: 'New',
        callTimestamp: new Date(callTime).toISOString(),
        callId: callObj.call_id,
      };

      // Create list item
      const { id: listItemId, plannerTaskId: existingPlannerTaskId } = await this.graphService.createSalesLeadItem(leadItem);

      // Create Planner task
      const taskTitle = `Follow up: Missed call from ${callerName}`;
      const taskDetails = `
Call ID: ${callObj.call_id}
Caller: ${callerName}
Phone: ${callerPhone}
Time: ${new Date(callTime).toLocaleString()}
Duration: ${duration}s

Please follow up with this missed call.
      `;

      const taskId = await this.graphService.createPlannerTask(
        taskTitle,
        taskDetails,
        new Date(Date.now() + 86400000), // Due tomorrow
        existingPlannerTaskId // Update existing task if present
      );

      // If we created a NEW task (and didn't have one before), link it to the item
      if (!existingPlannerTaskId && taskId) {
        await this.graphService.updateSalesLeadPlannerTaskId(listItemId, taskId);
      }

      // Post to Teams channel
      const teamsMessage = `
<h2>🔔 New Sales Lead - Missed Call</h2>
<p><strong>Caller:</strong> ${callerName}</p>
<p><strong>Phone:</strong> ${callerPhone}</p>
<p><strong>Time:</strong> ${new Date(callTime).toLocaleString()}</p>
<p><strong>Status:</strong> Needs Follow-up</p>
<p>A task has been created in Planner for follow-up.</p>
      `;

      // Post to Teams channel (Soft fail)
      try {
        await this.graphService.postToTeamsChannel(teamsMessage);
      } catch (err: any) {
        console.error('⚠ Failed to post to Teams (ignoring error):', err.message);
      }

      console.log(`✓ Missed call processed successfully`);
    } catch (error: any) {
      console.error('✗ Error processing missed call:', error.message);
      throw error; // This will cause Bull to retry
    }
  }

  async processVoicemail(job: ProcessJob): Promise<void> {
    console.log(`\n📞 Processing voicemail job ${job.id}`);

    try {
      const event = job.data.event;
      const voicemailObj = event.payload.object as any;

      console.log(`→ Voicemail ID: ${voicemailObj.id}`);

      // Extract details directly from webhook payload
      const callerName = voicemailObj.caller_name || voicemailObj.caller_number || 'Unknown';
      const callerPhone = voicemailObj.caller_number || 'Unknown';
      const callTime = voicemailObj.date_time || new Date().toISOString();
      const duration = voicemailObj.duration || 0;
      const downloadUrl = voicemailObj.download_url || '';
      // Transcript is often in transcription.content based on user logs
      const transcript = voicemailObj.transcription?.content || voicemailObj.transcript || '';

      // Prepare Sales Lead item
      const leadItem: SalesLeadItem = {
        channel: 'Zoom Phone',
        summary: `Voicemail from ${callerName}`,
        priority: 'High',
        status: 'New',
        callTimestamp: new Date(callTime).toISOString(),
        voicemailLink: downloadUrl,
        transcript: transcript,
        callId: voicemailObj.call_id || voicemailObj.id,
      };

      // Create list item
      const { id: listItemId, plannerTaskId: existingPlannerTaskId } = await this.graphService.createSalesLeadItem(leadItem);

      // Create Planner task
      const taskTitle = `Follow up: Voicemail from ${callerName}`;
      let taskDetails = `
Voicemail ID: ${voicemailObj.id}
Caller: ${callerName}
Phone: ${callerPhone}
Time: ${new Date(callTime).toLocaleString()}
Duration: ${duration}s

Voicemail Recording: ${downloadUrl}
`;

      if (transcript) {
        taskDetails += `\nTranscript:\n${transcript}\n`;
      }

      taskDetails += `\nPlease listen to the voicemail and follow up.`;

      const taskId = await this.graphService.createPlannerTask(
        taskTitle,
        taskDetails,
        new Date(Date.now() + 86400000), // Due tomorrow
        existingPlannerTaskId // Update existing task if present
      );

      // If we created a NEW task (and didn't have one before), link it to the item
      if (!existingPlannerTaskId && taskId) {
        await this.graphService.updateSalesLeadPlannerTaskId(listItemId, taskId);
      }

      // Post to Teams channel
      const teamsMessage = `
<h2>📞 New Sales Lead - Voicemail</h2>
<p><strong>Caller:</strong> ${callerName}</p>
<p><strong>Phone:</strong> ${callerPhone}</p>
<p><strong>Time:</strong> ${new Date(callTime).toLocaleString()}</p>
<p><strong>Duration:</strong> ${duration}s</p>
<p><a href="${downloadUrl}">Listen to Voicemail</a></p>
<p><strong>Transcript:</strong></p>
<blockquote>${transcript || 'No transcript available.'}</blockquote>
<p>A task has been created in Planner for follow-up.</p>
      `;

      // Post to Teams channel (Soft fail)
      // Only post if transcript is available (to avoid duplicate notifications)
      if (transcript && transcript.length > 0) {
        try {
          await this.graphService.postToTeamsChannel(teamsMessage);
        } catch (err: any) {
          console.error('⚠ Failed to post to Teams (ignoring error):', err.message);
        }
      } else {
        console.log('ℹ Skipping Teams notification (waiting for transcript)');
      }

      console.log(`✓ Voicemail processed successfully`);
    } catch (error: any) {
      console.error('✗ Error processing voicemail:', error.message);
      throw error; // This will cause Bull to retry
    }
  }
  async processSalesCall(job: ProcessJob): Promise<void> {
    console.log(`\n📞 Processing sales call job ${job.id}`);

    try {
      const event = job.data.event;
      const type = event.event;
      let callObj: any;
      let salesItem: SalesCallItem;

      if (type === 'phone.callee_call_log_completed') {
        const payloadObj = event.payload.object as any;
        callObj = payloadObj.call_logs[0];
        console.log(`→ Call Log ID: ${callObj.id}`);

        const callerName = callObj.caller_name || callObj.caller_number || 'Unknown';
        const callerPhone = callObj.caller_number || 'Unknown';
        const callTime = callObj.date_time || new Date().toISOString();
        const duration = callObj.duration || 0;

        salesItem = {
          contact: `${callerName} (${callerPhone})`,
          summary: callerName,
          priority: 'Medium',
          status: 'Completed',
          callTimestamp: new Date(callTime).toISOString(),
          callId: callObj.call_id,
          duration: duration,
        };
      } else if (type === 'phone.recording_completed') {
        const payloadObj = event.payload.object as any;
        callObj = payloadObj.recordings[0];
        console.log(`→ Recording ID: ${callObj.id}`);

        const callerName = callObj.caller_name || callObj.caller_number || 'Unknown';
        const callerPhone = callObj.caller_number || 'Unknown';
        const callTime = callObj.date_time || new Date().toISOString();

        salesItem = {
          contact: `${callerName} (${callerPhone})`,
          summary: callerName,
          priority: 'Medium',
          status: 'Recorded',
          callTimestamp: new Date(callTime).toISOString(),
          callId: callObj.call_id,
          duration: callObj.duration || 0,
          recordingLink: callObj.download_url
        };
      } else if (type === 'phone.recording_transcript_completed') {
        const payloadObj = event.payload.object as any;
        callObj = payloadObj.recordings[0];
        console.log(`→ Transcript ID: ${callObj.id}`);

        const callerName = callObj.caller_name || callObj.caller_number || 'Unknown';
        const callerPhone = callObj.caller_number || 'Unknown';
        const callTime = callObj.date_time || new Date().toISOString();
        const callId = callObj.call_id;

        // Download transcript content
        let transcriptContent = '';
        if (callObj.transcript_download_url) {
          console.log(`Downloading transcript from ${callObj.transcript_download_url}...`);
          const rawTranscript = await this.zoomService.downloadFile(callObj.transcript_download_url);
          transcriptContent = this.zoomService.parseTranscript(rawTranscript);
        }

        // Fetch AI Summary
        let aiSummary = '';
        console.log(`Fetching AI summary for call ${callId}...`);
        aiSummary = await this.zoomService.getCallSummary(callId);

        salesItem = {
          contact: `${callerName} (${callerPhone})`,
          summary: callerName,
          priority: 'Medium',
          status: 'Transcript Available',
          callTimestamp: new Date(callTime).toISOString(),
          callId: callId,
          duration: callObj.duration || 0,
          transcript: transcriptContent,
          aiSummary: aiSummary
        };
      } else if (type === 'phone.ai_call_summary_changed') {
        const payloadObj = event.payload.object as any;
        callObj = payloadObj;
        console.log(`→ AI Summary Event for Call ID: ${callObj.call_id}`);

        const aiSummary = await this.zoomService.getCallSummary(callObj.call_id);

        salesItem = {
          contact: 'Pending Lookup', // We typically update existing items, so this might not overwrite
          summary: 'AI Summary Update',
          priority: 'Medium',
          status: 'Summary Available', // New status?
          callTimestamp: new Date().toISOString(), // This is just an update
          callId: callObj.call_id,
          duration: 0,
          aiSummary: aiSummary
        };

      } else {
        console.warn(`⚠ Unhandled event type in sales call queue: ${type}`);
        return;
      }

      // Create or update item
      await this.graphService.createSalesCallItem(salesItem);
      console.log(`✓ Sales call processed successfully`);

    } catch (error: any) {
      console.error('✗ Error processing sales call:', error.message);
      throw error;
    }
  }
}
