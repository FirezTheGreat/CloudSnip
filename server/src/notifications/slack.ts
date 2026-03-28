/**
 * Slack Notification Service
 *
 * Sends rich Block Kit messages via Incoming Webhook.
 * Set SLACK_WEBHOOK_URL in your .env file to enable.
 *
 * Get a webhook: https://api.slack.com/messaging/webhooks
 * (Settings → Incoming Webhooks → Activate → Add New Webhook to Workspace)
 */

import type { AnomalyExplanation } from "./explanation";

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const APP_URL = process.env.DASHBOARD_URL || "http://localhost:5173";

// ─── Severity colour (Slack attachment colour bar) ────────────────────────────
const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444", // red
  high:     "#f97316", // orange
  medium:   "#f59e0b", // amber
  low:      "#64748b", // slate
};

// ─── Payload builders ─────────────────────────────────────────────────────────

interface AnomalyNotifInput {
  explanation: AnomalyExplanation;
  resourceId: string;
  resourceType: string;
  severity: string;
  anomalyScore: number;
  detectedAt: Date;
}

export async function notifyAnomalyDetected(input: AnomalyNotifInput): Promise<void> {
  if (!WEBHOOK_URL) return;

  const color = SEVERITY_COLORS[input.severity] || SEVERITY_COLORS.low;
  const scoreBar = "█".repeat(Math.round(input.anomalyScore * 10)) + "░".repeat(10 - Math.round(input.anomalyScore * 10));

  const payload = {
    text: `${input.explanation.emoji} ${input.explanation.headline}`,
    attachments: [
      {
        color,
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: `${input.explanation.emoji}  ${input.explanation.headline}`,
              emoji: true,
            },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Severity*\n\`${input.severity.toUpperCase()}\`` },
              { type: "mrkdwn", text: `*Type*\n\`${input.explanation.anomaly_type.replace(/_/g, " ")}\`` },
              { type: "mrkdwn", text: `*Resource*\n\`${input.resourceId.split("/").pop()}\`` },
              { type: "mrkdwn", text: `*Detected*\n${new Date(input.detectedAt).toLocaleTimeString()}` },
            ],
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*What happened:*\n${input.explanation.what_happened}`,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Why it matters:*\n${input.explanation.why_it_matters}`,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Anomaly Score: \`${scoreBar}\` ${(input.anomalyScore * 100).toFixed(0)}% · ${input.explanation.confidence_statement}`,
              },
            ],
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "Open Dashboard →", emoji: true },
                url: APP_URL,
                style: "primary",
              },
            ],
          },
        ],
      },
    ],
  };

  await sendWebhook(payload);
}

interface ActionNotifInput {
  explanation: AnomalyExplanation;
  resourceId: string;
  resourceType: string;
  actionType: string;
  severity: string;
  savingsMonthly: number;
  savingsHourly: number;
  executedAt: Date;
}

export async function notifyActionTaken(input: ActionNotifInput): Promise<void> {
  if (!WEBHOOK_URL) return;

  const payload = {
    text: `✅ CloudSnip auto-resolved: ${input.explanation.headline}`,
    attachments: [
      {
        color: "#10b981", // emerald — always green for resolved
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: `✅  Auto-Remediated: ${input.actionType.replace(/_/g, " ")}`,
              emoji: true,
            },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Resource*\n\`${input.resourceId.split("/").pop()}\`` },
              { type: "mrkdwn", text: `*Action*\n\`${input.actionType.replace(/_/g, " ")}\`` },
              { type: "mrkdwn", text: `*Hourly Savings*\n$${input.savingsHourly.toFixed(4)}/hr` },
              { type: "mrkdwn", text: `*Monthly Projected*\n$${input.savingsMonthly.toFixed(2)}/mo` },
            ],
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*What we did:*\n${input.explanation.what_we_did}`,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Impact:*\n${input.explanation.impact}`,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `CloudSnip Cloud Cost Intelligence · ${new Date(input.executedAt).toLocaleString()}`,
              },
            ],
          },
        ],
      },
    ],
  };

  await sendWebhook(payload);
}

export async function notifyApprovalNeeded(input: {
  resourceId: string;
  actionType: string;
  severity: string;
  anomalyType: string;
  description: string;
}): Promise<void> {
  if (!WEBHOOK_URL) return;

  const payload = {
    text: `🔔 Manual approval needed: ${input.actionType.replace(/_/g, " ")} on ${input.resourceId.split("/").pop()}`,
    attachments: [
      {
        color: "#8b5cf6", // violet — pending
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: `🔔  Approval Required — ${input.actionType.replace(/_/g, " ")}`,
              emoji: true,
            },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Resource*\n\`${input.resourceId.split("/").pop()}\`` },
              { type: "mrkdwn", text: `*Severity*\n\`${input.severity.toUpperCase()}\`` },
              { type: "mrkdwn", text: `*Anomaly*\n\`${input.anomalyType.replace(/_/g, " ")}\`` },
            ],
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: input.description },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "Review in Dashboard →", emoji: true },
                url: `${APP_URL}/#actions`,
                style: "primary",
              },
            ],
          },
        ],
      },
    ],
  };

  await sendWebhook(payload);
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function sendWebhook(payload: Record<string, unknown>): Promise<void> {
  if (!WEBHOOK_URL) return;

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.warn(`[Slack] Webhook returned ${res.status}: ${await res.text()}`);
    } else {
      console.log("[Slack] Notification sent ✓");
    }
  } catch (err: any) {
    // Non-fatal — never crash the pipeline because of a notification failure
    console.warn("[Slack] Failed to send notification:", err.message);
  }
}
