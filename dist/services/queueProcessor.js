"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueProcessor = void 0;
const zoomService_1 = require("../services/zoomService");
const graphService_1 = require("../services/graphService");
class QueueProcessor {
    constructor() {
        this.zoomService = new zoomService_1.ZoomService();
        this.graphService = new graphService_1.GraphService();
    }
    async processMissedCall(job) {
        console.log(`\n🔔 Processing missed call job ${job.id}`);
        try {
            const event = job.data.event;
            const callObj = event.payload.object;
            console.log(`→ Call ID: ${callObj.call_id}`);
            const callerName = callObj.caller.name || callObj.caller.phone_number || 'Unknown';
            const callerPhone = callObj.caller.phone_number || 'Unknown';
            const callTime = callObj.date_time || callObj.ringing_start_time || new Date().toISOString();
            const duration = callObj.duration || 0;
            const leadItem = {
                channel: 'Zoom Phone',
                summary: `Missed call from ${callerName}`,
                priority: 'High',
                status: 'New',
                callTimestamp: new Date(callTime).toISOString(),
                callId: callObj.call_id,
            };
            const { id: listItemId, plannerTaskId: existingPlannerTaskId } = await this.graphService.createSalesLeadItem(leadItem);
            const taskTitle = `Follow up: Missed call from ${callerName}`;
            const taskDetails = `
Call ID: ${callObj.call_id}
Caller: ${callerName}
Phone: ${callerPhone}
Time: ${new Date(callTime).toLocaleString()}
Duration: ${duration}s

Please follow up with this missed call.
      `;
            const taskId = await this.graphService.createPlannerTask(taskTitle, taskDetails, new Date(Date.now() + 86400000), existingPlannerTaskId);
            if (!existingPlannerTaskId && taskId) {
                await this.graphService.updateSalesLeadPlannerTaskId(listItemId, taskId);
            }
            const teamsMessage = `
<h2>🔔 New Sales Lead - Missed Call</h2>
<p><strong>Caller:</strong> ${callerName}</p>
<p><strong>Phone:</strong> ${callerPhone}</p>
<p><strong>Time:</strong> ${new Date(callTime).toLocaleString()}</p>
<p><strong>Status:</strong> Needs Follow-up</p>
<p>A task has been created in Planner for follow-up.</p>
      `;
            try {
                await this.graphService.postToTeamsChannel(teamsMessage);
            }
            catch (err) {
                console.error('⚠ Failed to post to Teams (ignoring error):', err.message);
            }
            console.log(`✓ Missed call processed successfully`);
        }
        catch (error) {
            console.error('✗ Error processing missed call:', error.message);
            throw error;
        }
    }
    async processVoicemail(job) {
        console.log(`\n📞 Processing voicemail job ${job.id}`);
        try {
            const event = job.data.event;
            const voicemailObj = event.payload.object;
            console.log(`→ Voicemail ID: ${voicemailObj.id}`);
            const callerName = voicemailObj.caller_name || voicemailObj.caller_number || 'Unknown';
            const callerPhone = voicemailObj.caller_number || 'Unknown';
            const callTime = voicemailObj.date_time || new Date().toISOString();
            const duration = voicemailObj.duration || 0;
            const downloadUrl = voicemailObj.download_url || '';
            const transcript = voicemailObj.transcription?.content || voicemailObj.transcript || '';
            const leadItem = {
                channel: 'Zoom Phone',
                summary: `Voicemail from ${callerName}`,
                priority: 'High',
                status: 'New',
                callTimestamp: new Date(callTime).toISOString(),
                voicemailLink: downloadUrl,
                transcript: transcript,
                callId: voicemailObj.call_id || voicemailObj.id,
            };
            const { id: listItemId, plannerTaskId: existingPlannerTaskId } = await this.graphService.createSalesLeadItem(leadItem);
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
            const taskId = await this.graphService.createPlannerTask(taskTitle, taskDetails, new Date(Date.now() + 86400000), existingPlannerTaskId);
            if (!existingPlannerTaskId && taskId) {
                await this.graphService.updateSalesLeadPlannerTaskId(listItemId, taskId);
            }
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
            if (transcript && transcript.length > 0) {
                try {
                    await this.graphService.postToTeamsChannel(teamsMessage);
                }
                catch (err) {
                    console.error('⚠ Failed to post to Teams (ignoring error):', err.message);
                }
            }
            else {
                console.log('ℹ Skipping Teams notification (waiting for transcript)');
            }
            console.log(`✓ Voicemail processed successfully`);
        }
        catch (error) {
            console.error('✗ Error processing voicemail:', error.message);
            throw error;
        }
    }
    async processSalesCall(job) {
        console.log(`\n📞 Processing sales call job ${job.id}`);
        try {
            const event = job.data.event;
            const type = event.event;
            let callObj;
            let salesItem;
            if (type === 'phone.callee_call_log_completed') {
                const payloadObj = event.payload.object;
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
            }
            else if (type === 'phone.recording_completed') {
                const payloadObj = event.payload.object;
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
            }
            else if (type === 'phone.recording_transcript_completed') {
                const payloadObj = event.payload.object;
                callObj = payloadObj.recordings[0];
                console.log(`→ Transcript ID: ${callObj.id}`);
                const callerName = callObj.caller_name || callObj.caller_number || 'Unknown';
                const callerPhone = callObj.caller_number || 'Unknown';
                const callTime = callObj.date_time || new Date().toISOString();
                const callId = callObj.call_id;
                let transcriptContent = '';
                if (callObj.transcript_download_url) {
                    console.log(`Downloading transcript from ${callObj.transcript_download_url}...`);
                    const rawTranscript = await this.zoomService.downloadFile(callObj.transcript_download_url);
                    transcriptContent = this.zoomService.parseTranscript(rawTranscript);
                }
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
            }
            else if (type === 'phone.ai_call_summary_changed') {
                const payloadObj = event.payload.object;
                callObj = payloadObj;
                console.log(`→ AI Summary Event for Call ID: ${callObj.call_id}`);
                const aiSummary = await this.zoomService.getCallSummary(callObj.call_id);
                salesItem = {
                    contact: 'Pending Lookup',
                    summary: 'AI Summary Update',
                    priority: 'Medium',
                    status: 'Summary Available',
                    callTimestamp: new Date().toISOString(),
                    callId: callObj.call_id,
                    duration: 0,
                    aiSummary: aiSummary
                };
            }
            else {
                console.warn(`⚠ Unhandled event type in sales call queue: ${type}`);
                return;
            }
            await this.graphService.createSalesCallItem(salesItem);
            console.log(`✓ Sales call processed successfully`);
        }
        catch (error) {
            console.error('✗ Error processing sales call:', error.message);
            throw error;
        }
    }
}
exports.QueueProcessor = QueueProcessor;
//# sourceMappingURL=queueProcessor.js.map