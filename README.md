# Zoom Phone Connector for Microsoft 365

This application automatically connects your Zoom Phone data to your Microsoft 365 services. This automates call logging and and missed calls without manual data entry.

## What it does

When a call is reciecved on Zoom Phone, this app listens for the event, parses the data, and sends to Microsoft 365 services where applicable.

### 1. Sales Calls
When you answer a sales call, the app:
- **Logs the call** to your SharePoint "Sales Calls" list.
- **Saves the recording** link directly in the list item.
- **Transcribes the call** into text and saves it to the "Transcript" column.
- **Adds the AI Summary** from Zoom so you can quickly see what was discussed (Not always available)

### 2. Voicemails (Sales Leads)
When you miss a call and receive a voicemail, the app:
- **Creates a new lead** in your SharePoint "Sales Leads" list.
- **Creates a task** in Microsoft Planner so you remember to follow up.
- **Posts a message** to your Teams channel with the caller's details and a link to listen to the voicemail.

## Setup Guide

You can run this app on any service that hosts Node.js (like Railway or Render but ideally it would run as an Azure Function).

### Prerequisites
1.  **Zoom Phone** with a "Server-to-Server OAuth" app created in the Zoom Marketplace.
2.  **Microsoft 365** tenant (SharePoint, Teams, Planner).
3.  **Azure AD App** with permissions to read/write to these services.

### Environment Variables
You will need to configure the following settings in your `.env` file:

**Microsoft Credentials:**
- `APPLICATION_ID` & `TENANT_ID`: From your Azure Portal.
- `CLIENT_SECRET_VALUE`: Your Azure App secret.

**Zoom Credentials:**
- `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`: From your Zoom App Marketplace console.
- `ZOOM_WEBHOOK_SECRET_TOKEN`: To verify the events are actually coming from Zoom.

**IDs for your Lists and Channels:**
- `SHAREPOINT_SITE_ID`: The ID of your SharePoint site.
- `SALES_LEADS_LIST_ID`: SharePoint ID for the Voicemails list.
- `SALES_CALLS_LIST_ID`: SharePoint ID for the Sales Calls list.
- `TEAMS_TEAM_ID` & `TEAMS_CHANNEL_ID`: Where Teams notifications should go.
- `PLANNER_PLAN_ID`: The ID of the Planner board for tasks.

### Installation
1.  Clone this repository.
2.  Run `npm install` to get the dependencies.
3.  Fill out your `.env` file (see `.env.example`).
4.  Run `npm run build` to compile the code.
5.  Run `npm start` to launch the server.

### Connect to Zoom
In your Zoom App settings (Event Subscriptions), add your server's URL (e.g., `https://your-app.com/api/webhook/zoom`) and subscribe to these events:
- `phone.callee_missed_call`
- `phone.caller_ended`
- `phone.voicemail_received`
- `phone.recording_completed`
- `phone.recording_transcript_completed`
- `phone.ai_call_summary_changed`
