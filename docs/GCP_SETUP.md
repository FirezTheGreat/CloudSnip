# GCP Setup Guide — Step by Step

## Prerequisites
- A Google account
- A credit/debit card (GCP requires one even for free tier — you get $300 free credits for 90 days)

---

## Step 1: Create GCP Account & Project

1. Go to https://cloud.google.com/free
2. Click "Get started for free"
3. Follow the signup flow — phone verification, card on file
4. You get **$300 in free credits** for 90 days — more than enough for a hackathon
5. GCP creates a default project — or create a new one:

```bash
# Install gcloud CLI if you don't have it: https://cloud.google.com/sdk/docs/install
gcloud projects create cost-intel-demo --name="Cost Intel Demo"
gcloud config set project cost-intel-demo
```

**Important:** Set a billing budget immediately.
- Go to Billing → Budgets & alerts → Create Budget
- Set amount to $10
- Set alert thresholds at 50%, 90%, 100%
- This is your safety net

---

## Step 2: Enable Required APIs

GCP APIs are disabled by default. Enable the ones we need:

```bash
gcloud services enable compute.googleapis.com
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable monitoring.googleapis.com
gcloud services enable cloudbilling.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

---

## Step 3: Create Service Account for Programmatic Access

You need a service account (not your personal account) with specific roles.

```bash
# Create the service account
gcloud iam service-accounts create cost-intel-app \
  --display-name="Cost Intel Application"

# Get the full email
SA_EMAIL="cost-intel-app@$(gcloud config get-value project).iam.gserviceaccount.com"

# Grant required roles
gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/compute.viewer"

gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/compute.instanceAdmin.v1"

gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/monitoring.viewer"

gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/cloudfunctions.viewer"

gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/cloudfunctions.developer"

gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/storage.objectViewer"

gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/billing.viewer"

# Create and download the key file
gcloud iam service-accounts keys create service-account-key.json \
  --iam-account="$SA_EMAIL"
```

Put the key file path in your `.env`:
```bash
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
GCP_PROJECT_ID=cost-intel-demo
GCP_ZONE=us-central1-a
GCP_REGION=us-central1
```

**Never commit `service-account-key.json` to git.** It's already in `.gitignore`.

---

## Step 4: Provision Demo Resources

These are the resources your system will monitor and optimize.

### 4a. Compute Engine VM (your "idle instance" subject)

```bash
# Create an e2-micro instance (free tier eligible in us-central1)
gcloud compute instances create cost-intel-demo-vm \
  --machine-type=e2-micro \
  --zone=us-central1-a \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --labels=project=cloud-cost-intel \
  --tags=cost-intel-demo

# Note: e2-micro is free tier in us-central1, us-west1, us-east1
```

**For the demo:** Leave this VM running and idle. Your system should detect CPU < 5% and auto-stop it.

### 4b. Cloud Function (your "runaway function" subject)

Create a simple function that does nothing useful:

```bash
# Create the function directory
mkdir -p cloud-function-demo
cat > cloud-function-demo/index.js << 'EOF'
const functions = require('@google-cloud/functions-framework');

functions.http('costIntelDemo', (req, res) => {
  // Simulate some work
  const start = Date.now();
  while (Date.now() - start < 100) {} // busy-wait 100ms
  res.send('OK');
});
EOF

cat > cloud-function-demo/package.json << 'EOF'
{
  "name": "cost-intel-demo-function",
  "dependencies": {
    "@google-cloud/functions-framework": "^3.0.0"
  }
}
EOF

# Deploy (2nd gen Cloud Function)
gcloud functions deploy cost-intel-demo-function \
  --gen2 \
  --runtime=nodejs18 \
  --region=us-central1 \
  --source=cloud-function-demo \
  --entry-point=costIntelDemo \
  --trigger-http \
  --allow-unauthenticated \
  --memory=128Mi \
  --max-instances=1000

# DO NOT set a low max-instances — leave it high
# This is what your system will "fix" by capping it
```

**For the demo:** Hit this function's URL 100+ times rapidly. Your system should detect the invocation spike and cap max instances.

### 4c. Cloud Storage Bucket

```bash
gcloud storage buckets create gs://cost-intel-demo-$(gcloud config get-value project) \
  --location=us-central1 \
  --default-storage-class=STANDARD \
  --labels=project=cloud-cost-intel
```

### 4d. Persistent Disk (your "orphan disk" subject)

```bash
# Create an unattached persistent disk
gcloud compute disks create cost-intel-orphan-disk \
  --size=10GB \
  --type=pd-standard \
  --zone=us-central1-a \
  --labels=project=cloud-cost-intel

# Note: do NOT attach this to any VM
# Your system should detect it's unattached and flag/delete it
```

---

## Step 5: Verify Everything Works

Run these commands to verify your resources exist and your credentials work:

```bash
# Test Compute Engine access
gcloud compute instances list --filter="labels.project=cloud-cost-intel"

# Test Cloud Monitoring access (get CPU for your VM)
gcloud monitoring time-series list \
  --filter='metric.type="compute.googleapis.com/instance/cpu/utilization"' \
  --limit=5

# Test Cloud Functions access
gcloud functions list --region=us-central1

# Test Persistent Disks
gcloud compute disks list --filter="labels.project=cloud-cost-intel"

# Test Cloud Storage
gcloud storage ls
```

---

## Step 6: Get the Cloud Function URL (for triggering spikes)

```bash
# Get the function's trigger URL
gcloud functions describe cost-intel-demo-function \
  --region=us-central1 \
  --format='value(serviceConfig.uri)'
```

Save this URL — you'll use it to trigger invocation spikes during the demo:

```bash
# Trigger spike: invoke 100 times rapidly
FUNCTION_URL=$(gcloud functions describe cost-intel-demo-function --region=us-central1 --format='value(serviceConfig.uri)')
for i in $(seq 1 100); do
  curl -s "$FUNCTION_URL" &
done
wait
echo "Done — 100 invocations sent"
```

---

## Cost Safety Checklist

- [ ] Billing budget set at $10
- [ ] Using e2-micro in us-central1 (free tier)
- [ ] Persistent disk is ≤ 30 GB total (free tier)
- [ ] Cloud Function has 128 MB memory (minimize cost)
- [ ] No external static IPs without a VM attached ($0.004/hr when idle)
- [ ] No Cloud NAT (costs $0.044/hr per gateway)
- [ ] $300 free credits active (valid for 90 days from account creation)
- [ ] Clean up all resources after the hackathon

---

## Cleanup Script (Run After Hackathon)

```bash
# Delete Compute Engine VM
gcloud compute instances delete cost-intel-demo-vm --zone=us-central1-a --quiet

# Delete Cloud Function
gcloud functions delete cost-intel-demo-function --region=us-central1 --quiet

# Delete Persistent Disk
gcloud compute disks delete cost-intel-orphan-disk --zone=us-central1-a --quiet

# Delete Cloud Storage bucket
gcloud storage rm -r gs://cost-intel-demo-$(gcloud config get-value project)

# Delete service account (optional)
gcloud iam service-accounts delete \
  cost-intel-app@$(gcloud config get-value project).iam.gserviceaccount.com --quiet

# Delete the project entirely (nuclear option)
# gcloud projects delete $(gcloud config get-value project) --quiet
```

---

## Key Difference from AWS

| AWS Concept | GCP Equivalent | Notes |
|-------------|----------------|-------|
| EC2 Instance | Compute Engine VM | GCP uses `e2-micro` (free tier) instead of `t2.micro` |
| Lambda | Cloud Functions (2nd gen) | GCP uses max instances instead of concurrency |
| S3 | Cloud Storage (GCS) | Nearly identical concept |
| EBS Volume | Persistent Disk | Same concept, GCP calls them "disks" |
| CloudWatch | Cloud Monitoring | Different API, similar concept |
| Cost Explorer | Cloud Billing / BigQuery export | GCP billing is query-based, not a dedicated API |
| IAM User + Access Keys | Service Account + JSON Key | GCP uses key files, not key ID + secret pairs |
| Regions (us-east-1) | Regions (us-central1) | Different naming convention |
| Tags | Labels | Same concept, different name (GCP: key-value labels) |
