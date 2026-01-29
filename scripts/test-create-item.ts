
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { config } from '../src/config';
import 'isomorphic-fetch';

async function main() {
    console.log('Final Verification: Testing String Payload...');

    const credential = new ClientSecretCredential(
        config.tenantId,
        config.applicationId,
        config.clientSecret
    );

    const client = Client.initWithMiddleware({
        authProvider: {
            getAccessToken: async () => {
                const token = await credential.getToken('https://graph.microsoft.com/.default');
                return token.token;
            },
        },
    });

    const item = {
        fields: {
            Title: 'Final Verification Item',
            Channel: 'Test',
            Priority: 'Low',
            Status: 'New',
            CallTimestamp: new Date().toISOString(),
            CallId: `VERIFY-${Date.now()}`,
            VoicemailLink: 'https://example.com/verified'
        }
    };

    try {
        const res = await client
            .api(`/sites/${config.sharePointSiteId}/lists/${config.salesLeadsListId}/items`)
            .post(item);
        console.log('✓ Success! Item created with ID:', res.id);
        console.log('✓ This confirms the column is accepting Text/String payloads.');
    } catch (error: any) {
        console.log('✗ Failed to create item.');
        if (error.body) {
            try {
                const body = JSON.parse(error.body);
                console.log('Error:', body.error?.message || error.body);
            } catch {
                console.log('Error Body:', error.body);
            }
        } else {
            console.log('Error:', error.message);
        }
    }
}

main();
