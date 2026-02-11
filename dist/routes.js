"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRoutes = createRoutes;
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const webhookValidator_1 = require("./utils/webhookValidator");
const config_1 = require("./config");
function createRoutes(queueService, zoomService, graphService) {
    const router = (0, express_1.Router)();
    router.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            environment: config_1.config.nodeEnv,
        });
    });
    router.get('/queue-status', async (req, res) => {
        try {
            const stats = await queueService.getQueueStats();
            res.json(stats);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    router.get('/webhook/zoom', (req, res) => {
        res.status(200).json({
            status: 'ok',
            message: 'Zoom webhook endpoint is reachable',
            timestamp: new Date().toISOString(),
        });
    });
    router.post('/webhook/zoom', async (req, res) => {
        try {
            const timestamp = req.headers['x-zm-request-timestamp'];
            const signature = req.headers['x-zm-signature'];
            if (!timestamp || !signature) {
                console.warn('⚠ Missing Zoom webhook headers');
                return res.status(400).json({ error: 'Missing required headers' });
            }
            const rawBody = JSON.stringify(req.body);
            if (!(0, webhookValidator_1.validateZoomWebhook)(rawBody, timestamp, signature, config_1.config.zoomWebhookSecretToken)) {
                console.warn('⚠ Invalid webhook signature');
                return res.status(401).json({ error: 'Invalid signature' });
            }
            const event = req.body;
            console.log(`\n📥 Received Zoom webhook: ${event.event}`);
            console.log('📦 Full payload:', JSON.stringify(event, null, 2));
            if (event.event === 'endpoint.url_validation') {
                const plainToken = req.body?.payload?.plainToken;
                if (!plainToken) {
                    console.warn('⚠ endpoint.url_validation missing plainToken');
                    return res.status(400).json({ error: 'Missing plainToken' });
                }
                const encryptedToken = crypto_1.default
                    .createHmac('sha256', config_1.config.zoomWebhookSecretToken)
                    .update(plainToken)
                    .digest('hex');
                console.log('✓ Responding to endpoint.url_validation challenge');
                return res.status(200).json({
                    plainToken,
                    encryptedToken,
                });
            }
            switch (event.event) {
                case 'phone.callee_ended':
                case 'phone.caller_ended': {
                    const callObj = event.payload.object;
                    const hangupResult = callObj.handup_result || callObj.result || '';
                    if (hangupResult === 'Call Canceled' || hangupResult === 'Voicemail' || hangupResult === 'No Answer' || hangupResult.toLowerCase().includes('missed')) {
                        await queueService.addMissedCall({ type: 'missed_call', event });
                        console.log(`→ Queued missed call: ${callObj.call_id} (${hangupResult})`);
                    }
                    else {
                        console.log(`→ Call was answered (${hangupResult}), skipping: ${callObj.call_id}`);
                    }
                    break;
                }
                case 'phone.callee_missed': {
                    const callObj = event.payload.object;
                    await queueService.addMissedCall({ type: 'missed_call', event });
                    console.log(`→ Queued missed call: ${callObj.call_id} (${callObj.handup_result})`);
                    break;
                }
                case 'phone.voicemail_received': {
                    await queueService.addVoicemail({ type: 'voicemail', event });
                    console.log(`→ Queued voicemail: ${event.payload.object.id}`);
                    break;
                }
                case 'phone.callee_call_log_completed': {
                    const callLog = event.payload.object;
                    const log = callLog.call_logs[0];
                    console.log(`→ Call log completed: ${log.call_id}`);
                    console.log(`   Result: ${log.result}, Duration: ${log.duration}s, Has Recording: ${log.has_recording}`);
                    if (log.result === 'Recorded' && log.has_recording) {
                        console.log(`→ Answered call with recording available`);
                    }
                    break;
                }
                case 'phone.callee_ringing': {
                    const callObj = event.payload.object;
                    console.log(`→ Phone ringing: ${callObj.call_id}`);
                    break;
                }
                case 'phone.callee_answered': {
                    const callObj = event.payload.object;
                    console.log(`→ Call answered: ${callObj.call_id}`);
                    break;
                }
                case 'phone.recording_started': {
                    const recordingObj = event.payload.object;
                    console.log(`→ Recording started: ${recordingObj.call_id}`);
                    break;
                }
                case 'phone.recording_completed': {
                    const recordingObj = event.payload.object;
                    console.log(`→ Recording completed: ${recordingObj.recordings[0]?.call_id}`);
                    await queueService.addSalesCall({ type: 'sales_call', event });
                    break;
                }
                case 'phone.recording_transcript_completed': {
                    const recordingObj = event.payload.object;
                    console.log(`→ Transcript completed: ${recordingObj.recordings[0]?.call_id}`);
                    await queueService.addSalesCall({ type: 'sales_call', event });
                    break;
                }
                case 'phone.ai_call_summary_changed': {
                    const summaryObj = event.payload.object;
                    console.log(`→ AI Summary available/changed: ${summaryObj.call_id}`);
                    await queueService.addSalesCall({ type: 'sales_call', event });
                    break;
                }
                case 'phone.callee_call_log_completed': {
                    const callLogObj = event.payload.object;
                    const log = callLogObj.call_logs[0];
                    console.log(`→ Call log completed: ${log.call_id}`);
                    console.log(`   Result: ${log.result}, Duration: ${log.duration}s, Has Recording: ${log.has_recording}`);
                    if (log.result !== 'Missed' && log.result !== 'Voicemail') {
                        await queueService.addSalesCall({ type: 'sales_call', event });
                    }
                    break;
                }
                case 'phone.voicemail_transcript_completed': {
                    const transcriptObj = event.payload.object;
                    console.log(`→ Voicemail transcript completed: ${transcriptObj.call_id}`);
                    console.log(`   Transcript: ${transcriptObj.transcription?.content || 'N/A'}`);
                    await queueService.addVoicemail({ type: 'voicemail', event });
                    break;
                }
                case 'phone.callee_missed_call': {
                    await queueService.addMissedCall({ type: 'missed_call', event });
                    const callObj = event.payload.object;
                    console.log(`→ Queued missed call: ${callObj.call_id}`);
                    break;
                }
                default:
                    console.log(`→ Unhandled event type: ${event.event}`);
            }
            res.status(200).json({ message: 'Webhook received' });
        }
        catch (error) {
            console.error('✗ Error processing webhook:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    router.post('/log-call', async (req, res) => {
        try {
            const { callId, contact, summary, priority, status } = req.body;
            if (!callId) {
                return res.status(400).json({ error: 'callId is required' });
            }
            console.log(`\n📝 Logging answered call: ${callId}`);
            const callDetails = await zoomService.getCallDetails(callId);
            const recording = await zoomService.getRecording(callId);
            const callItem = {
                contact: contact || callDetails.caller.name || callDetails.caller.phone_number,
                summary: summary || callDetails.caller.name || callDetails.caller.phone_number,
                priority: priority || 'Medium',
                status: status || 'Completed',
                callTimestamp: new Date(callDetails.date_time).toISOString(),
                recordingLink: recording.url,
                transcript: recording.transcript || '',
                aiSummary: '',
                callId: callDetails.call_id,
                duration: callDetails.duration,
            };
            const listItemId = await graphService.createSalesCallItem(callItem);
            console.log(`✓ Call logged successfully`);
            res.status(200).json({
                message: 'Call logged successfully',
                listItemId,
            });
        }
        catch (error) {
            console.error('✗ Error logging call:', error.message);
            res.status(500).json({ error: error.message });
        }
    });
    router.get('/test-graph', async (req, res) => {
        try {
            const success = await graphService.testConnection();
            res.json({
                success,
                message: success ? 'Graph API connection successful' : 'Graph API connection failed'
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    return router;
}
//# sourceMappingURL=routes.js.map