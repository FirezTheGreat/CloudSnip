# CloudSnip: Autonomous Cloud Cost Intelligence
**Tagline:** Stop bleeding cloud budget. Detect anomalies instantly, explain them clearly, and remediate them autonomously.

---

## Slide 1: The Problem — The Cloud Cost Black Hole
* **The Reality:** Companies waste 30%+ of their cloud spend on idle resources, forgotten disks, and runaway serverless functions.
* **The Tools:** Existing tools (like GCP Billing or AWS Cost Explorer) look backwards. By the time you see the spike on a chart 24 hours later, the money is already gone.
* **The Pain:** DevOps teams are flooded with static alerts with no context. They have to manually SSH into machines or dig through Cloud Monitoring to understand *why* costs spiked, then manually resolve it.

## Slide 2: The Solution — CloudSnip
CloudSnip is a **real-time, ML-powered FinOps console**. It doesn't just show you past bills; it actively monitors your infrastructure, catches anomalies the moment they happen, and stops them autonomously.

**Key Pillars:**
1. **Real-Time Telemetry:** Ingests metric data from GCP every 5 minutes.
2. **Machine Learning:** Uses a Python-based **Isolation Forest** to separate genuine anomalies from standard traffic spikes.
3. **NLP Explanations:** Translates complex telemetry changes into human-readable Slack alerts (What happened, Why it matters, What we did).
4. **Autonomous Remediation:** Executes GCP API commands immediately (stops VMs, caps functions, deletes orphan disks) to stop the bleed.

## Slide 3: Architecture & Tech Stack (How it works)
* **Frontend:** React 19, TypeScript, Recharts, Tailwind CSS v4. A premium, light-mode FinOps console that updates completely live via WebSockets. No page refreshes.
* **Backend:** Express/Node.js telemetry engine. Connects securely to Google Cloud SDKs (Compute, Billing, Monitoring).
* **Database:** MongoDB Atlas (NoSQL) with TTL (Time-To-Live) indexing for rapid 30-day telemetry retention.
* **AI/ML Layer:** Dedicated Python Flask microservice running Scikit-Learn (Isolation Forest) models.

## Slide 4: Real-time Demo (The Wow Factor)
*(During the presentation, use the dashboard's built-in "Simulation Control" to trigger these live)*

### Scenario 1: The Forgotten "Zombie" VM
* **Trigger:** Click "Idle VM" simulator.
* **What happens behind the scenes:** ML model detects a sustained drop in CPU below 5% for 30 minutes.
* **The Action:** CloudSnip's auto-optimizer calls the GCP Compute Engine API and issues a `STOP` command to the specific instance.
* **The Result:** The dashboard Action Log updates instantly, and the Savings Tracker adds exactly $5.55/mo to the projected savings.

### Scenario 2: The Runaway Cloud Function
* **Trigger:** Click "Runaway Function" simulator.
* **What happens behind the scenes:** A recursive loop causes function invocations to spike 100x above baseline. ML model flags an immediate cost threat.
* **The Action:** CloudSnip intercepts the threat and issues a GCP API call to cap the `maxInstances` to 5.
* **The Result:** Slack notification fires instantly: *"🔴 Runaway function detected -> 🟢 Capped instances. Bleeding stopped."*

## Slide 5: Visibility & Governance
It's not just about stopping resources; it's about building a sustainable cloud culture.
* **What-If Simulator:** Let engineers see the projected yearly and monthly saving impacts of downsizing a machine type *before* they apply terraform.
* **Compliance Report:** A daily graded snapshot of overall cloud health (Orphaned IP addresses, unattached disks, lacking labels).
* **Heatmaps:** A 7-day anomaly heatmap shows *when* the infrastructure struggles most, isolating peak risk hours.

## Slide 6: Why CloudSnip Wins
* **It's Active, Not Passive:** Moving from "look at this chart" to "we saved you $400 while you slept."
* **Enterprise Ready:** Full approval/rollback workflows built into the dashboard. Every decision is reversible. Error boundaries prevent full-app crashes.
* **Beautiful UX:** Consumer-grade design in a B2B space. Fluid animations, crisp typography, and data-dense but readable layouts.

---

### Playbook for Judges/Q&A
* **"How do you handle false positives?"**
  * *Answer:* Our ML model uses a strict 0.7 confidence threshold. Anything below that (or heavily disruptive actions) gets pushed to a "Pending Review" state in Slack via Block Kit buttons where an engineer must explicitly click "Approve".
* **"How is this different from GCP Active Assist?"**
  * *Answer:* Active Assist is primarily weekly batch recommendations. CloudSnip is a 5-minute real-time pipeline. You use Active Assist for long-term architecture planning; you use CloudSnip to stop a recursive cloud function loop from costing you $5,000 this weekend.
