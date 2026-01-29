
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { config } from '../src/config';
import 'isomorphic-fetch';

async function main() {
    console.log('Inspecting SharePoint columns...');

    try {
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

        console.log(`Site ID: ${config.sharePointSiteId}`);
        console.log(`List ID: ${config.salesLeadsListId}`);

        const columns = await client
            .api(`/sites/${config.sharePointSiteId}/lists/${config.salesLeadsListId}/columns`)
            .get();

        console.log('\n--- Columns Found ---');
        columns.value.forEach((col: any) => {
            console.log(`Display Name: ${col.displayName}`);
            console.log(`Name (Internal): ${col.name}`);
            console.log(`Type: ${col.text ? 'Text' : col.dateTime ? 'DateTime' : col.number ? 'Number' : col.url ? 'Url' : col.choice ? 'Choice' : 'Other'}`);
            if (col.choice) {
                console.log(`Choices: ${JSON.stringify(col.choice.choices)}`);
            }
            console.log('-------------------');
        });

    } catch (error: any) {
        console.error('Error inspecting columns:', error.message);
        if (error.body) {
            console.error('Error body:', JSON.stringify(error.body, null, 2));
        }
    }
}

main();
