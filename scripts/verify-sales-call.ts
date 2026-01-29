import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

// Load env from root
dotenv.config({ path: path.join(__dirname, '../.env') });

const SECRET_TOKEN = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}/api/webhook/zoom`;

if (!SECRET_TOKEN) {
    console.error('Error: ZOOM_WEBHOOK_SECRET_TOKEN not found in .env');
    process.exit(1);
}

const CALL_ID = `TEST-SALES-CALL-${Date.now()}`;
const TIMESTAMP = Date.now().toString();

function generateSignature(body: any, timestamp: string): string {
    const message = `v0:${timestamp}:${JSON.stringify(body)}`;
    const hash = crypto.createHmac('sha256', SECRET_TOKEN!).update(message).digest('hex');
    return `v0=${hash}`;
}

async function sendWebhook(eventType: string, payload: any) {
    const body = {
        event: eventType,
        event_ts: Date.now(),
        payload: payload
    };

    const signature = generateSignature(body, TIMESTAMP);

    try {
        console.log(`Sending ${eventType}...`);
        const response = await axios.post(BASE_URL, body, {
            headers: {
                'x-zm-request-timestamp': TIMESTAMP,
                'x-zm-signature': signature,
                'Content-Type': 'application/json'
            }
        });
        console.log(`✅ ${eventType} Success: ${response.status}`);
    } catch (error: any) {
        if (error.response) {
            console.error(`❌ ${eventType} Failed: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        } else {
            console.error(`❌ ${eventType} Failed:`, error.message);
        }
    }
}

async function runTest() {
    console.log(`Starting Sales Call Test with Call ID: ${CALL_ID}`);
    console.log('--------------------------------------------------');

    // 1. Call Log Completed (Answered/Recorded call)
    await sendWebhook('phone.callee_call_log_completed', {
        account_id: 'test_account',
        object: {
            call_logs: [{
                id: `LOG-${CALL_ID}`,
                call_id: CALL_ID,
                caller_name: 'Test Customer',
                caller_number: '+15559998888',
                callee_number: '2012',
                date_time: new Date().toISOString(),
                duration: 120,
                result: 'Recorded', // Important: must be 'Recorded' or not 'Missed'/'Voicemail'
                has_recording: true
            }]
        }
    });

    console.log('Waiting 5 seconds for Call Log processing...');
    await new Promise(r => setTimeout(r, 5000));

    // 2. Recording Completed
    await sendWebhook('phone.recording_completed', {
        account_id: 'test_account',
        object: {
            recordings: [{
                id: `REC-${CALL_ID}`,
                call_id: CALL_ID,
                caller_name: 'Test Customer',
                caller_number: '+15559998888',
                date_time: new Date().toISOString(),
                duration: 120,
                download_url: 'https://example.com/recording.mp4'
            }]
        }
    });

    console.log('Waiting 5 seconds for Recording processing...');
    await new Promise(r => setTimeout(r, 5000));


    // 3. Transcript Completed
    await sendWebhook('phone.recording_transcript_completed', {
        account_id: 'test_account',
        object: {
            recordings: [{
                id: `REC-${CALL_ID}`, // Same recording ID usually
                call_id: CALL_ID,
                caller_name: 'Test Customer',
                caller_number: '+15559998888',
                date_time: new Date().toISOString(),
                transcript_download_url: 'https://example.com/transcript.vtt'
            }]
        }
    });

    console.log('Waiting 5 seconds for Transcript processing...');
    await new Promise(r => setTimeout(r, 5000));

    // 4. AI Call Summary Changed
    await sendWebhook('phone.ai_call_summary_changed', {
        account_id: 'test_account',
        object: {
            call_id: CALL_ID,
            ai_call_summary_id: `SUMMARY-${CALL_ID}`,
            date_time: new Date().toISOString()
        }
    });

    console.log('--------------------------------------------------');
    console.log('Test sequence complete. Please check logs to verify:');
    console.log('1. Call Log created a new Sales Call Item.');
    console.log('2. Recording event updated the item with Recording Link.');
    console.log('3. Transcript event updated the item with Transcript Content.');
    console.log('4. AI Summary event updated the item with AI Summary.');
}

runTest();
