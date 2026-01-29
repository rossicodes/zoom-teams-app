import { GraphService } from '../src/services/graphService';
import { config } from '../src/config';
import dotenv from 'dotenv';
import path from 'path';

// Load env explicitly
dotenv.config({ path: path.join(__dirname, '../.env') });

async function verify() {
    const callId = process.argv[2];
    if (!callId) {
        console.error('Usage: ts-node check-sales-results.ts <CALL_ID>');
        process.exit(1);
    }

    console.log(`Verifying Sales Call results for Call ID: ${callId}`);

    const graphService = new GraphService();

    try {
        const client = (graphService as any).client;

        console.log('Querying SharePoint Sales Calls List for item...');
        const result = await client
            .api(`/sites/${config.sharePointSiteId}/lists/${config.salesCallsListId}/items`)
            .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
            .filter(`fields/CallId eq '${callId}'`)
            .expand('fields')
            .get();

        if (!result.value || result.value.length === 0) {
            console.error('❌ Item not found in SharePoint!');
            return;
        }

        const item = result.value[0];
        const fields = item.fields;
        console.log(`Found Item ID: ${item.id}`);
        console.log('Fields Dump:', JSON.stringify(fields, null, 2));

        let success = true;

        // Verify fields
        if (fields.Status === 'Transcript Available' || fields.Status === 'Summary Available') {
            console.log(`✅ Status is correct: ${fields.Status}`);
        } else {
            console.error(`❌ Status mismatch. Expected 'Transcript Available' or 'Summary Available', got '${fields.Status}'`);
            success = false;
        }

        if (fields.RecordingUrl && fields.RecordingUrl.includes('recording.mp4')) {
            console.log('✅ RecordingUrl is present');
        } else {
            console.error('❌ RecordingUrl missing or incorrect');
            success = false;
        }

        // Verify Transcript Content (stored in TranscriptUrl column)
        if (fields.TranscriptUrl && fields.TranscriptUrl.includes('Test User: Hello, this is a test call.')) {
            console.log('✅ Transcript content is present and formatted correctly');
        } else {
            console.error(`❌ Transcript content missing or incorrect. Got: ${fields.TranscriptUrl?.substring(0, 100)}...`);
            success = false;
        }

        // Verify AI Summary
        if (fields.AiSummary && fields.AiSummary.includes('MOCK AI SUMMARY')) {
            console.log('✅ AI Summary is present');
        } else {
            console.error(`❌ AI Summary missing or incorrect. Got: ${fields.AiSummary}`);
            success = false;
        }

        if (success) {
            console.log('🎉 VERIFICATION SUCCESSFUL!');
        } else {
            console.log('💥 VERIFICATION FAILED');
        }

    } catch (error: any) {
        console.error('Verification failed:', error.message);
        if (error.body) {
            console.error('Error Body:', JSON.stringify(error.body, null, 2));
        }
    }
}

verify();
