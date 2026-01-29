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

const CALL_ID = `TEST-CALL-${Date.now()}`;
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
    console.log(`Starting Deduplication Test with Call ID: ${CALL_ID}`);
    console.log('--------------------------------------------------');

    // 1. Missed Call
    // This should create a new Sales Lead Item and a Planner Task
    await sendWebhook('phone.callee_missed_call', {
        account_id: 'test_account',
        object: {
            id: CALL_ID,
            call_id: CALL_ID,
            caller: { name: 'Test Caller', phone_number: '+15550001234' },
            callee: { name: 'Test Agent', phone_number: '+15550005678' },
            date_time: new Date().toISOString(),
            duration: 0
        }
    });

    console.log('Waiting 5 seconds for Missed Call processing...');
    await new Promise(r => setTimeout(r, 5000));

    // 2. Voicemail Transcript
    // This should find the existing Sales Lead Item (by Call ID) and UPDATE the Planner Task
    // instead of creating a new one.
    await sendWebhook('phone.voicemail_transcript_completed', {
        account_id: 'test_account',
        object: {
            id: `VM-${CALL_ID}`, // Voicemail ID might be different
            call_id: CALL_ID,   // REQUIRED to match the missed call
            caller_name: 'Test Caller',
            caller_number: '+15550001234',
            callee_name: 'Test Agent',
            callee_number: '+15550005678',
            date_time: new Date().toISOString(),
            duration: 30,
            download_url: 'https://example.com/voicemail.mp3',
            transcription: {
                content: 'This is a test voicemail transcript. Verify successful update of existing task.'
            }
        }
    });

    console.log('--------------------------------------------------');
    console.log('Test sequence complete. Please check logs to verify:');
    console.log('1. Missed Call created a new Planner Task.');
    console.log('2. Voicemail Transcript reused the EXISTING Planner Task.');
}

runTest();
