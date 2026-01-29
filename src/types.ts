export interface ZoomWebhookEvent {
  event: string;
  event_ts: number;
  payload: {
    account_id: string;
    object: ZoomCallObject | ZoomVoicemailObject;
  };
}

export interface ZoomCallObject {
  id: string;
  call_id: string;
  caller: {
    name: string;
    phone_number: string;
    extension_number?: string;
    user_id?: string;
  };
  callee: {
    name: string;
    phone_number: string;
    extension_number?: string;
    user_id?: string;
  };
  direction: 'inbound' | 'outbound';
  duration: number;
  result: string;
  date_time: string;
  hangup_by?: string;
}

export interface ZoomVoicemailObject {
  id: string;
  call_id?: string;
  caller_name: string;
  caller_number: string;
  callee_name: string;
  callee_number: string;
  date_time: string;
  duration: number;
  download_url: string;
  transcript?: string;
  status?: string;
}

export interface SalesLeadItem {
  channel: string;
  summary: string;
  priority: string;
  owner?: number[];
  status: string;
  callTimestamp: string;
  voicemailLink?: string;
  transcript?: string;
  callId: string;
  plannerTaskId?: string;
}

export interface SalesCallItem {
  contact: string;
  summary: string;
  priority: string;
  owner?: number[];
  status: string;
  callTimestamp: string;
  recordingLink?: string;
  transcript?: string;
  aiSummary?: string;
  callId: string;
  duration: number;
}

export interface QueueJob {
  type: 'missed_call' | 'voicemail' | 'sales_call';
  event: ZoomWebhookEvent;
}
