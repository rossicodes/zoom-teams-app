import { Router, Request, Response } from 'express';
import { validateZoomWebhook } from './utils/webhookValidator';
import { ZoomService } from './services/zoomService';
import { GraphService } from './services/graphService';
import { QueueService } from './services/queueService';
import { config } from './config';
import { ZoomWebhookEvent, SalesCallItem } from './types';

export function createRoutes(
  queueService: QueueService,
  zoomService: ZoomService,
  graphService: GraphService
): Router {
  const router = Router();

  // Health check endpoint
  router.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
    });
  });

  // Queue status endpoint
  router.get('/queue-status', async (req: Request, res: Response) => {
    try {
      const stats = await queueService.getQueueStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Zoom webhook receiver
  router.post('/webhook/zoom', async (req: Request, res: Response) => {
    try {
      // Get headers for validation
      const timestamp = req.headers['x-zm-request-timestamp'] as string;
      const signature = req.headers['x-zm-signature'] as string;

      if (!timestamp || !signature) {
        console.warn('⚠ Missing Zoom webhook headers');
        return res.status(400).json({ error: 'Missing required headers' });
      }

      // Get raw body (must be string for validation)
      const rawBody = JSON.stringify(req.body);

      // Validate webhook signature
      if (!validateZoomWebhook(rawBody, timestamp, signature, config.zoomWebhookSecretToken)) {
        console.warn('⚠ Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Parse event
      const event: ZoomWebhookEvent = req.body;
      console.log(`\n📥 Received Zoom webhook: ${event.event}`);
      console.log('📦 Full payload:', JSON.stringify(event, null, 2));

      // Handle different event types
      switch (event.event) {
        case 'phone.callee_ended':
        case 'phone.caller_ended': {
          // Check if call was missed (check handup_result field)
          const callObj = event.payload.object as any;
          const hangupResult = callObj.handup_result || callObj.result || '';

          if (hangupResult === 'Call Canceled' || hangupResult === 'Voicemail' || hangupResult === 'No Answer' || hangupResult.toLowerCase().includes('missed')) {
            await queueService.addMissedCall({ type: 'missed_call', event });
            console.log(`→ Queued missed call: ${callObj.call_id} (${hangupResult})`);
          } else {
            console.log(`→ Call was answered (${hangupResult}), skipping: ${callObj.call_id}`);
          }
          break;
        }

        case 'phone.callee_missed': {
          // Handle missed call event directly
          const callObj = event.payload.object as any;
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
          const callLog = event.payload.object as any;
          const log = callLog.call_logs[0];

          console.log(`→ Call log completed: ${log.call_id}`);
          console.log(`   Result: ${log.result}, Duration: ${log.duration}s, Has Recording: ${log.has_recording}`);

          // Optionally auto-log answered calls with recordings
          if (log.result === 'Recorded' && log.has_recording) {
            console.log(`→ Answered call with recording available`);
            // You could auto-log this, but for now we'll let users manually log it
          }
          break;
        }

        case 'phone.callee_ringing': {
          const callObj = event.payload.object as any;
          console.log(`→ Phone ringing: ${callObj.call_id}`);
          break;
        }

        case 'phone.callee_answered': {
          const callObj = event.payload.object as any;
          console.log(`→ Call answered: ${callObj.call_id}`);
          break;
        }

        case 'phone.recording_started': {
          const recordingObj = event.payload.object as any;
          console.log(`→ Recording started: ${recordingObj.call_id}`);
          break;
        }

        case 'phone.recording_completed': {
          const recordingObj = event.payload.object as any;
          console.log(`→ Recording completed: ${recordingObj.recordings[0]?.call_id}`);
          await queueService.addSalesCall({ type: 'sales_call', event });
          break;
        }

        case 'phone.recording_transcript_completed': {
          const recordingObj = event.payload.object as any;
          console.log(`→ Transcript completed: ${recordingObj.recordings[0]?.call_id}`);
          await queueService.addSalesCall({ type: 'sales_call', event });
          break;
        }

        case 'phone.ai_call_summary_changed': {
          const summaryObj = event.payload.object as any;
          console.log(`→ AI Summary available/changed: ${summaryObj.call_id}`);
          await queueService.addSalesCall({ type: 'sales_call', event });
          break;
        }

        case 'phone.callee_call_log_completed': {
          const callLogObj = event.payload.object as any;
          const log = callLogObj.call_logs[0];
          console.log(`→ Call log completed: ${log.call_id}`);
          console.log(`   Result: ${log.result}, Duration: ${log.duration}s, Has Recording: ${log.has_recording}`);

          // Only process answered/recorded calls here. Missed calls are handled by callee_missed_call
          if (log.result !== 'Missed' && log.result !== 'Voicemail') {
            await queueService.addSalesCall({ type: 'sales_call', event });
          }
          break;
        }

        case 'phone.voicemail_transcript_completed': {
          const transcriptObj = event.payload.object as any;
          console.log(`→ Voicemail transcript completed: ${transcriptObj.call_id}`);
          console.log(`   Transcript: ${transcriptObj.transcription?.content || 'N/A'}`);
          // Enqueue job to update SharePoint with transcript
          await queueService.addVoicemail({ type: 'voicemail', event });
          break;
        }

        case 'phone.callee_missed_call': {
          // This event might not always fire, but handle it if it does
          await queueService.addMissedCall({ type: 'missed_call', event });
          const callObj = event.payload.object as any;
          console.log(`→ Queued missed call: ${callObj.call_id}`);
          break;
        }

        default:
          console.log(`→ Unhandled event type: ${event.event}`);
      }

      res.status(200).json({ message: 'Webhook received' });
    } catch (error: any) {
      console.error('✗ Error processing webhook:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Manual call logging endpoint
  router.post('/log-call', async (req: Request, res: Response) => {
    try {
      const { callId, contact, summary, priority, status } = req.body;

      if (!callId) {
        return res.status(400).json({ error: 'callId is required' });
      }

      console.log(`\n📝 Logging answered call: ${callId}`);

      // Get call details
      const callDetails = await zoomService.getCallDetails(callId);

      // Get recording if available
      const recording = await zoomService.getRecording(callId);

      // Prepare Sales Call item
      const callItem: SalesCallItem = {
        contact: contact || callDetails.caller.name || callDetails.caller.phone_number,
        summary: summary || callDetails.caller.name || callDetails.caller.phone_number,
        priority: priority || 'Medium',
        status: status || 'Completed',
        callTimestamp: new Date(callDetails.date_time).toISOString(),
        recordingLink: recording.url,
        transcript: recording.transcript || '',
        aiSummary: '', // Manual log might not have summary readily available yet
        callId: callDetails.call_id,
        duration: callDetails.duration,
      };

      // Create list item
      const listItemId = await graphService.createSalesCallItem(callItem);

      console.log(`✓ Call logged successfully`);

      res.status(200).json({
        message: 'Call logged successfully',
        listItemId,
      });
    } catch (error: any) {
      console.error('✗ Error logging call:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Test Graph API connection
  router.get('/test-graph', async (req: Request, res: Response) => {
    try {
      const success = await graphService.testConnection();
      res.json({
        success,
        message: success ? 'Graph API connection successful' : 'Graph API connection failed'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}