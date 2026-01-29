import { GraphService } from '../src/services/graphService';
import { config } from '../src/config';
import dotenv from 'dotenv';
import path from 'path';

// Load env explicitly
dotenv.config({ path: path.join(__dirname, '../.env') });

async function verify() {
    const callId = process.argv[2];
    if (!callId) {
        console.error('Usage: ts-node check-results.ts <CALL_ID>');
        process.exit(1);
    }

    console.log(`Verifying results for Call ID: ${callId}`);

    const graphService = new GraphService();

    try {
        const client = (graphService as any).client;

        console.log('Querying SharePoint for item...');
        const result = await client
            .api(`/sites/${config.sharePointSiteId}/lists/${config.salesLeadsListId}/items`)
            .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
            .filter(`fields/CallId eq '${callId}'`)
            .expand('fields')
            .get();

        if (!result.value || result.value.length === 0) {
            console.error('❌ Item not found in SharePoint!');
            return;
        }

        const item = result.value[0];
        console.log(`Found Item ID: ${item.id}`);
        console.log('Item Dump:', JSON.stringify(item, null, 2));

        const plannerTaskId = item.fields.PlannerTaskId;

        if (!plannerTaskId) {
            console.error('❌ FAILURE: No PlannerTaskId found on SharePoint item!');
            return;
        }

        console.log(`Found PlannerTaskId: ${plannerTaskId}`);

        // Check Planner Task
        console.log(`Fetching Planner Task details for: ${plannerTaskId}...`);

        const task = await client.api(`/planner/tasks/${plannerTaskId}`).get();
        console.log(`Planner Task Title: ${task.title}`);

        const taskDetails = await client.api(`/planner/tasks/${plannerTaskId}/details`).get();

        console.log('----- Planner Task Description -----');
        console.log(taskDetails.description);
        console.log('------------------------------------');

        if (taskDetails.description.includes('Voicemail Recording') && taskDetails.description.includes('Missed call') && taskDetails.description.includes('This is a test voicemail transcript')) {
            console.log('✅ SUCCESS: Description contains Missed Call info AND Voicemail/Transcript info associated with the update.');
        } else {
            if (taskDetails.description.includes('This is a test voicemail transcript')) {
                console.log('✅ SUCCESS: Transcript found in description.');
            } else {
                console.error('❌ FAILURE: Transcript NOT found in description.');
            }
        }

    } catch (error: any) {
        console.error('Verification failed:', error.message);
        if (error.body) {
            console.error('Error Body:', JSON.stringify(error.body, null, 2));
        }
    }
}

verify();
