# ClawTalk Endpoint Shape Reference

> Generated 2026-03-09 from server code analysis + live response captures.

## Legend

- **DB** = Response from PostgreSQL `RETURNING *`
- **Telnyx** = Proxied to Telnyx API, response shape from Telnyx
- **Enriched** = DB record + additional data fetched from Telnyx/joins

---

## User

### `GET /v1/me` — DB
**SDK:** `getMe()`
**Params:** none
**Response:**
```ts
{
  user_id: string
  email: string
  phone: string | null
  phone_verified: boolean
  subscription_tier: string          // "free" | "pro" | etc.
  effective_tier: string
  effective_source: string
  effective_days_remaining: number | null
  subscription_status: string
  paranoid_mode: boolean
  voice_preference: string | null
  system_number: string | null
  dedicated_number: string | null
  quota: {
    daily_call_seconds_limit: number
    daily_calls_limit: number
    monthly_call_seconds_limit: number
    monthly_messages_limit: number
    monthly_missions_limit: number
    monthly_mission_events_limit: number
    max_call_duration_seconds: number
  }
  usage_today: { ... }
  usage_this_month: { ... }
  created_at: string
  last_ws_connected_at: string | null
  totp_enabled: boolean
  clawdbot_instance_id: string | null
}
```

---

## Calls

### `POST /v1/calls` — DB (202)
**SDK:** `initiateCall()`
**Params:** `{ to: string, greeting?: string, purpose?: string }`
**Response:**
```ts
{ call_id: string, status: "initiating", direction: "outbound" }
```

### `GET /v1/calls/:callId` — DB
**SDK:** `getCallStatus()`
**Params:** path `callId`
**Response:**
```ts
{ call_id: string, direction: string, status: string, started_at: string, duration_seconds: number, user_id: string }
```

### `POST /v1/calls/:callId/end` — DB
**SDK:** `endCall()`
**Params:** path `callId`
**Response:**
```ts
{ call_id: string, status: "ending", duration_seconds: number }
```

---

## SMS / Messages

### `POST /v1/messages/send` — DB
**SDK:** `sendSms()`
**Params:** `{ to: string, message: string, media_urls?: string[] }`
**Response:**
```ts
{ id: string, telnyx_message_id: string, status: string, from: string, to: string }
```

### `GET /v1/messages` — DB
**SDK:** `listMessages()`
**Params:** query `{ contact?: string, direction?: string, page?: number, limit?: number }`
**Response:**
```ts
{ messages: SmsMessage[], pagination: { page: number, limit: number, total: number, pages: number } }
```
Each message: `{ id, from, to, body, direction, status, created_at, media_urls? }`

### `GET /v1/messages/conversations` — DB
**SDK:** `listConversations()`
**Params:** none
**Response:**
```ts
{ conversations: [{ contact: string, last_message: string, last_message_at: string, unread_count: number }] }
```

---

## Approvals

### `POST /v1/approvals` — DB
**SDK:** `createApproval()`
**Params:** `{ action: string, details?: string, require_biometric?: boolean, expires_in?: number }`
**Response:**
```ts
{ request_id: string, status: string, expires_at: string, devices_notified: number, devices_failed: number }
```

### `GET /v1/approvals/:requestId` — DB
**SDK:** `getApprovalStatus()`
**Params:** path `requestId`
**Response:**
```ts
{
  request_id: string, action: string, details: string | null,
  require_biometric: boolean, status: string,
  created_at: string, expires_at: string,
  responded_at: string | null, response: any | null,
  biometric_verified: boolean | null
}
```

---

## Missions

### `POST /v1/missions` — DB (201)
**SDK:** `createMission()`
**Params:** `{ name: string, instructions: string, channel?: string, assistant_id?: string, metadata?: object }`
**Response:** `{ mission: <MissionRecord> }` — full DB row:
```ts
{
  id: string, user_id: string, telnyx_mission_id: string, telnyx_run_id: string,
  name: string, instructions: string, status: string, channel: string,
  target_count: number, events_used: number, assistant_id: string | null,
  assistant_phone: string | null, metadata: object,
  created_at: string, updated_at: string,
  result_summary: string | null, result_payload: object | null
}
```

### `GET /v1/missions/:missionId` — Enriched
**SDK:** `getMission()`
**Params:** path `missionId`
**Response:** `{ mission: <MissionRecord + enrichments> }`
```ts
{
  // all MissionRecord fields above, plus:
  assistant: AssistantRecord | null   // full assistant object if assigned
  linked_agents: LinkedAgent[]        // from Telnyx
  plan: { steps: PlanStep[] }         // from Telnyx
}
```

### `GET /v1/missions` — Enriched
**SDK:** `listMissions()`
**Params:** query `{ status?: string }`
**Response:** `{ missions: MissionRecord[] }` — each record includes computed fields:
```ts
{
  // all MissionRecord fields, plus:
  computed_target_count: string    // NOTE: string from SQL COUNT
  computed_event_count: string
  computed_scheduled_count: string
}
```

### `POST /v1/missions/:missionId/cancel` — DB
**SDK:** not implemented
**Params:** path `missionId`
**Response:** `{ mission: MissionRecord }`

---

## Runs (Telnyx-proxied)

### `POST /v1/missions/:missionId/runs` — Telnyx (201)
**SDK:** `createRun()`
**Params:** path `missionId`, body `{ input: object }`
**Response:** `{ data: <RunRecord> }`
```ts
{
  run_id: string, mission_id: string, organization_id: string,
  status: string, input: object,
  started_at: string, finished_at: string | null,
  result_summary: string | null, result_payload: object | null,
  error: string | null, metadata: object | null,
  updated_at: string
}
```

### `GET /v1/missions/:missionId/runs/:runId` — Telnyx
**SDK:** `getRun()`
**Params:** path `missionId`, `runId`
**Response:** `{ data: <RunRecord> }` (same shape as above)

### `PATCH /v1/missions/:missionId/runs/:runId` — Telnyx
**SDK:** `updateRun()`
**Params:** path `missionId`, `runId`, body `{ status?: string, result_summary?: string, result_payload?: object }`
**Response:** `{ data: <RunRecord> }`

### `GET /v1/missions/:missionId/runs` — Telnyx
**SDK:** `listRuns()`
**Params:** path `missionId`, query `{ page_number?: number, page_size?: number }`
**Response:**
```ts
{
  data: RunRecord[],
  meta: { total_pages: number, total_results: number, page_number: number, page_size: number }
}
```

---

## Plans (Telnyx-proxied)

### `POST /v1/missions/:missionId/runs/:runId/plan` — Telnyx
**SDK:** `createPlan()`
**Params:** path `missionId`, `runId`, body `{ steps: PlanStepInput[] }`
Each step **requires**: `{ step_id: string, sequence: number, title: string, description?: string, status?: string }`
**Response:** `{ data: PlanStep[] }` — NOTE: `data` is an array, NOT `{ steps: [...] }`

### `GET /v1/missions/:missionId/runs/:runId/plan` — Telnyx
**SDK:** `getPlan()`
**Params:** path `missionId`, `runId`
**Response:** `{ data: PlanStep[] }` — array of steps (empty array if no plan)

### `PATCH /v1/missions/:missionId/runs/:runId/plan/steps/:stepId` — Telnyx
**SDK:** `updateStep()`
**Params:** path `missionId`, `runId`, `stepId`, body `{ status?: string, ... }`
**Response:** `{ data: PlanStep }`

---

## Mission Events (Telnyx-proxied)

### `POST /v1/missions/:missionId/runs/:runId/events` — Telnyx
**SDK:** `logEvent()`
**Params:** path `missionId`, `runId`, body `{ type: string, summary: string, agent_id?: string, step_id?: string, payload?: object }`
**Response:** `{ data: MissionEvent }`

### `GET /v1/missions/:missionId/runs/:runId/events` — Telnyx
**SDK:** `listEvents()`
**Params:** path `missionId`, `runId`
**Response:**
```ts
{
  data: MissionEvent[],
  meta: { total_pages: number, total_results: number, page_number: number, page_size: number }
}
```

### `GET /v1/missions/:missionId/events` — DB
**SDK:** not implemented
**Params:** path `missionId`
**Response:** mission-level events

---

## Linked Agents (Telnyx-proxied)

### `POST /v1/missions/:missionId/runs/:runId/agents` — Telnyx (201)
**SDK:** `linkAgent()`
**Params:** path `missionId`, `runId`, body `{ telnyx_agent_id: string }`
**Response:** `{ data: { run_id: string, telnyx_agent_id: string, created_at: string } }`

### `GET /v1/missions/:missionId/runs/:runId/agents` — Telnyx
**SDK:** `listLinkedAgents()`
**Params:** path `missionId`, `runId`
**Response:** `{ data: [{ run_id: string, telnyx_agent_id: string, created_at: string }] }`

### `DELETE /v1/missions/:missionId/runs/:runId/agents/:agentId` — Telnyx
**SDK:** `unlinkAgent()`
**Params:** path `missionId`, `runId`, `agentId`
**Response:** `204 No Content`

---

## Insights (Telnyx-proxied)

### `GET /v1/missions/conversations/:conversationId/insights` — Telnyx
**SDK:** `getInsights()`
**Params:** path `conversationId`
**Response:** `{ data: { conversation_id, summary, sentiment, key_topics[], action_items[] } }`

### `GET /v1/missions/recordings/:recordingId` — Telnyx
**SDK:** not implemented
**Params:** path `recordingId`
**Response:** recording data/URL

---

## Assistants

### `POST /v1/assistants` — DB (201)
**SDK:** `createAssistant()`
**Params:** `{ name: string, instructions: string, greeting?: string, model?: string, enabled_features?: string[], tools?: object[] }`
**Response:** `{ assistant: <AssistantRecord> }`
```ts
{
  id: string, user_id: string, telnyx_assistant_id: string,
  name: string, description: string | null, model: string,
  enabled_features: string[], phone_number: string | null,
  phone_number_id: string | null, connection_id: string | null,
  config: object,
  created_at: string, updated_at: string
}
```

### `GET /v1/assistants/:assistantId` — DB
**SDK:** `getAssistant()`
**Params:** path `assistantId`
**Response:** `{ assistant: <AssistantRecord> }` (same shape)

### `GET /v1/assistants` — DB
**SDK:** `listAssistants()`
**Params:** none
**Response:** `{ assistants: AssistantRecord[] }`

### `PATCH /v1/assistants/:assistantId` — DB
**SDK:** `updateAssistant()`
**Params:** path `assistantId`, body (partial assistant fields)
**Response:** `{ assistant: <AssistantRecord> }`

### `DELETE /v1/assistants/:assistantId` — DB
**SDK:** not implemented
**Params:** path `assistantId`
**Response:** `204 No Content`

### `GET /v1/assistants/:assistantId/connection-id` — DB
**SDK:** `getAssistantConnectionId()`
**Params:** path `assistantId`
**Response:** `{ connection_id: string }`

### `POST /v1/assistants/:assistantId/assign-phone` — DB
**SDK:** `assignPhone()`
**Params:** path `assistantId`, body `{ connection_id: string, type: string }`
**Response:** `{ assistant: <AssistantRecord> }`

---

## Scheduled Events

### `POST /v1/assistants/:assistantId/events` — DB
**SDK:** `scheduleCall()` / `scheduleSms()`
**Params:** path `assistantId`, body:
```ts
{
  channel: "call" | "sms"        // NOT "type"!
  to_number: string
  from_number: string
  scheduled_at: string
  text_body?: string             // SMS body — NOT "message"!
  step_id?: string               // for plan step auto-sync
  telnyx_mission_id?: string
  telnyx_run_id?: string
  metadata?: object
}
```
**Response:** full `scheduled_events` DB row:
```ts
{
  id: string, user_id: string, assistant_id: string,
  telnyx_assistant_id: string, telnyx_event_id: string,
  channel: "call" | "sms", to_number: string, from_number: string,
  scheduled_at: string, text_body: string | null,
  metadata: object | null, status: string, call_status: string | null,
  conversation_id: string | null,
  telnyx_mission_id: string | null, telnyx_run_id: string | null,
  step_id: string | null,
  created_at: string, updated_at: string
}
```

### `GET /v1/assistants/:assistantId/events` — DB
**SDK:** not implemented
**Params:** path `assistantId`
**Response:** `{ events: ScheduledEventRecord[] }`

### `GET /v1/assistants/:assistantId/events/:eventId` — DB
**SDK:** `getScheduledEvent()`
**Params:** path `assistantId`, `eventId`
**Response:** full `scheduled_events` DB row (same as create)

### `DELETE /v1/assistants/:assistantId/events/:eventId` — DB
**SDK:** `cancelScheduledEvent()`
**Params:** path `assistantId`, `eventId`
**Response:** `204 No Content` or `{ event: ScheduledEventRecord }`

---

## Phone Numbers

### `GET /v1/numbers/account-phones/available` — DB
**SDK:** `getAvailablePhone()`
**Params:** none
**Response:** `{ phone: { id: string, phone_number: string, status: string, ordered_at: string } }`

### `PATCH /v1/numbers/account-phones/:phoneId` — DB
**SDK:** `assignPhone()`
**Params:** path `phoneId`, body (assignment details)
**Response:** `{ phone: PhoneRecord }`

### `GET /v1/numbers/account-phones` — DB
**SDK:** not implemented
**Params:** none
**Response:** `{ data: [{ id: string, phone_number: string, status: string, ordered_at: string }] }`

### `GET /v1/numbers/search` — Telnyx
**SDK:** not implemented
**Params:** query `{ country_code?, state?, city?, contains? }`
**Response:** `{ data: PhoneNumber[] }`

### `POST /v1/numbers/order` — DB+Telnyx
**SDK:** not implemented
**Params:** `{ phone_number: string }`
**Response:** `{ phone: PhoneRecord }`

### `POST /v1/numbers/release` — DB+Telnyx
**SDK:** not implemented
**Params:** `{ phone_number_id: string }`
**Response:** `{ success: boolean }`

### `GET /v1/numbers/mine` — DB
**SDK:** not implemented
**Params:** none
**Response:** `{ phones: UserPhoneRecord[] }`
- `user_numbers` table: `{ id, phone_number, status, ordered_at }`

---

## Key Discrepancies: SDK types.ts vs Actual Server

| Issue | SDK types.ts says | Server actually returns |
|---|---|---|
| Mission wrapper | `MissionResponse` (flat) | `{ mission: {...} }` wrapped |
| Assistant wrapper | `AssistantResponse` (flat) | `{ assistant: {...} }` wrapped |
| Run response | `{ id, ... }` | `{ data: { run_id, ... } }` |
| Plan response | `{ steps: [...] }` | `{ data: [...] }` (array directly) |
| Linked agents | `{ agents: [...] }` | `{ data: [...] }` |
| List runs | `{ data: RunResponse[] }` | `{ data: [...], meta: {...} }` |
| Scheduled event `type` field | `type: 'call' \| 'sms'` | `channel: 'call' \| 'sms'` |
| Scheduled event SMS body | `message` | `text_body` |
| Mission list computed fields | not typed | `computed_target_count` etc. (strings) |
| Assistant fields | missing many | `telnyx_assistant_id, enabled_features, config, ...` |
| Messages pagination | `{ total }` | `{ pagination: { page, limit, total, pages } }` |
