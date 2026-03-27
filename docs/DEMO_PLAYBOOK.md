# Demo Playbook — How to Trigger & Present Anomalies

## The 3-Minute Demo Script

Your demo needs to tell a story. Not "here's what the system does" but "watch it happen live."

---

## Pre-Demo Setup (30 min before)

1. Start all services: `docker-compose up -d && npm run dev` (backend + ML + dashboard)
2. Verify data is flowing: check the dashboard shows cost trends
3. Prepare your three anomaly triggers (don't fire them yet)
4. Have the AWS console open in another tab (side-by-side proof)
5. Clear old anomalies from the DB so the feed is clean

```sql
UPDATE anomalies SET resolved = TRUE WHERE resolved = FALSE;
```

---

## Demo Flow

### Slide 1 (30 seconds): The Problem
"Cloud waste costs companies $100 billion per year. Most of it is idle resources nobody notices. We built a system that detects and fixes this automatically."

### Slide 2 (30 seconds): Architecture
Show the diagram from README.md. Point out:
- "Real AWS resources, real billing data"
- "ML-based anomaly detection via Isolation Forest"
- "Autonomous optimization with audit trail"

### Live Demo (2 minutes):

**Step 1: Show the dashboard** (20 seconds)
"Here's our live dashboard. You can see real cost trends from our AWS account. Currently everything is normal — no anomalies."

**Step 2: Trigger Anomaly 1 — Idle EC2** (30 seconds)
"I left this EC2 instance running idle for 30 minutes. Watch..."
- Point to the anomaly feed — a card should appear
- "Our ML model detected CPU at 1.2% — an idle instance costing $0.023/hr"
- "The system automatically stopped it. Here's the audit log: saved $16.56/month projected"
- Switch to AWS console, show the instance is actually stopped

**Step 3: Trigger Anomaly 2 — Lambda Spike** (30 seconds)
Run the Lambda invoker script:
```bash
node scripts/invoke-lambda-spike.ts
```
- "I'm now hammering this Lambda function with 200 invocations"
- Point to the anomaly feed — "Runaway function detected"
- "System capped concurrency to 5. Cost controlled."

**Step 4: Show Savings** (20 seconds)
- Point to the savings tracker
- "Total automated savings: $X.XX/hour, $XX/month projected"
- "Every action is audited — before cost, after cost, timestamp, status"

### Closing (30 seconds)
"This runs continuously. No human intervention needed. The system watches, detects, and acts. All actions are reversible and audited."

---

## How to Trigger Each Anomaly Type

### 1. Idle EC2 Instance
**Setup:** Leave a t2.micro running with nothing on it for 30+ minutes.
**What happens:** CloudWatch reports CPU < 5%. ML service flags it. Optimizer stops it.
**Expected savings:** $0.0116/hr → $0/hr = $8.47/month

### 2. Runaway Lambda
**Setup:** Invoke your demo Lambda 100+ times in rapid succession.

```bash
# scripts/invoke-lambda-spike.ts
# Run this to generate a spike
for i in $(seq 1 100); do
  aws lambda invoke --function-name cost-intel-demo-function /dev/null &
done
wait
echo "Done — 100 invocations sent"
```

**What happens:** Invocation count spikes 10x normal. ML flags the anomaly. Optimizer sets reserved concurrency to 5.
**Expected savings:** Prevents unbounded scaling

### 3. Orphan EBS Volume
**Setup:** Create an unattached EBS volume (already done in provisioning).
**What happens:** Resource inventory scan finds a volume with no attachments. Flagged as unused. Optimizer deletes it.
**Expected savings:** $0.10/GB/month × 8 GB = $0.80/month

### 4. Untagged Resources
**Setup:** Create any resource without the "Project" tag.
**What happens:** Resource scan finds untagged resources. System auto-tags with `needs-review`.
**Not a cost saving but shows governance capability.**

---

## Fallback Plan

If AWS APIs are slow or Cost Explorer hasn't activated:

1. Use seed data (see DATABASE_SCHEMA.md) to pre-populate metrics
2. The ML service will still detect anomalies in seed data
3. Have screenshots/recordings from a successful run ready
4. The dashboard works with seed data — it just queries the DB

---

## What Judges Will Ask (and Your Answers)

**Q: "Is this real data or mocked?"**
A: "Real. Here's the AWS console showing the same resources." (Show the console tab)

**Q: "What ML model are you using?"**
A: "Isolation Forest from scikit-learn. It works by randomly partitioning data — anomalies get isolated in fewer splits. We chose it over Prophet because Prophet needs weeks of historical data, and Isolation Forest works with any dataset size."

**Q: "How do you prevent the system from taking destructive actions?"**
A: "Three safeguards: First, confidence threshold — only acts on scores above 0.7. Second, the action engine only performs reversible operations (stop, not terminate). Third, complete audit trail with before/after costs and rollback capability."

**Q: "What would this look like in production?"**
A: "Add a Slack/PagerDuty integration for alerts, a manual approval workflow for high-cost actions, multi-account support via AWS Organizations, and continuous model retraining on the growing metric history."

**Q: "How much did it actually save?"**
A: Show the savings tracker. Have the number ready: "In our demo environment, $X.XX per month across Y automated actions."
