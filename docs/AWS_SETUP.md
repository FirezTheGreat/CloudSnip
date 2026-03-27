# AWS Setup Guide — Step by Step

## Prerequisites
- A credit/debit card (AWS requires one even for free tier)
- An email address not already associated with AWS

---

## Step 1: Create AWS Free Tier Account

1. Go to https://aws.amazon.com/free/
2. Click "Create a Free Account"
3. Follow the signup flow — phone verification, card on file
4. Select "Basic Support — Free"
5. Wait 10-15 minutes for the account to fully activate

**Important:** Set a billing alarm immediately.
- Go to CloudWatch → Alarms → Create Alarm
- Select "Billing" → "Total Estimated Charge"
- Set threshold to $5 — you'll get emailed if you exceed it
- This is your safety net

---

## Step 2: Create IAM User for Programmatic Access

You need an IAM user (not your root account) with specific permissions.

1. Go to IAM → Users → Create User
2. User name: `cost-intel-app`
3. Check "Provide user access to the AWS Management Console" → **No** (API only)
4. Click Next → Attach policies directly
5. Click "Create policy" → JSON tab → paste the policy from README.md
6. Name the policy: `CostIntelPolicy`
7. Attach it to the user
8. Click the user → Security credentials → Create access key
9. Select "Application running outside AWS"
10. **Copy the Access Key ID and Secret Access Key — you won't see the secret again**

Put these in your `.env` file:
```bash
AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxxxxx
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AWS_REGION=us-east-1
```

---

## Step 3: Enable Cost Explorer

Cost Explorer is not enabled by default on new accounts.

1. Go to the AWS Billing Console → Cost Explorer
2. Click "Enable Cost Explorer"
3. **Wait 24 hours** — Cost Explorer needs time to process billing data
4. This is the most common gotcha. If `getCostAndUsage()` returns empty, it's because you haven't waited long enough.

**Hackathon tip:** Enable this FIRST, before doing anything else. The 24-hour wait means you need to do this the day before the hackathon starts.

---

## Step 4: Provision Demo Resources

These are the resources your system will monitor and optimize. Run these commands with AWS CLI, or create them in the console.

### 4a. EC2 Instance (your "idle instance" subject)

```bash
# Create a t2.micro instance (free tier eligible)
aws ec2 run-instances \
  --image-id ami-0c02fb55956c7d316 \
  --instance-type t2.micro \
  --key-name your-key-pair \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=cost-intel-demo},{Key=Project,Value=cloud-cost-intel}]' \
  --count 1

# Note the instance ID (i-0xxxxxxxxxxxxxxxxx) — you'll need it
```

**For the demo:** Leave this instance running and idle. Your system should detect CPU < 5% and auto-stop it.

### 4b. Lambda Function (your "runaway function" subject)

Create a simple Lambda that does nothing useful:

```javascript
// lambda-demo/index.mjs
export const handler = async (event) => {
  // Simulate some work
  const start = Date.now();
  while (Date.now() - start < 100) {} // busy-wait 100ms
  return { statusCode: 200, body: 'OK' };
};
```

```bash
# Zip and deploy
cd lambda-demo
zip function.zip index.mjs
aws lambda create-function \
  --function-name cost-intel-demo-function \
  --runtime nodejs18.x \
  --handler index.handler \
  --zip-file fileb://function.zip \
  --role arn:aws:iam::YOUR_ACCOUNT_ID:role/lambda-basic-role \
  --timeout 10 \
  --memory-size 128

# DO NOT set reserved concurrency — leave it unlimited
# This is what your system will "fix" by capping it
```

**For the demo:** Invoke this Lambda 100+ times rapidly using a script. Your system should detect the invocation spike and cap concurrency.

### 4c. S3 Bucket

```bash
aws s3 mb s3://cost-intel-demo-bucket-YOUR_UNIQUE_ID
```

### 4d. EBS Volume (your "orphan volume" subject)

```bash
# Create an unattached EBS volume
aws ec2 create-volume \
  --availability-zone us-east-1a \
  --size 8 \
  --volume-type gp2 \
  --tag-specifications 'ResourceType=volume,Tags=[{Key=Name,Value=cost-intel-orphan},{Key=Project,Value=cloud-cost-intel}]'

# Note: do NOT attach this to any instance
# Your system should detect it's unattached and flag/delete it
```

### 4e. RDS Instance (optional — adds to your resource count)

```bash
aws rds create-db-instance \
  --db-instance-identifier cost-intel-demo-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username admin \
  --master-user-password YourPassword123! \
  --allocated-storage 20 \
  --no-multi-az \
  --tags Key=Project,Value=cloud-cost-intel
```

---

## Step 5: Create Lambda Execution Role (if you don't have one)

```bash
# Create the role
aws iam create-role \
  --role-name lambda-basic-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "lambda.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Attach basic execution policy
aws iam attach-role-policy \
  --role-name lambda-basic-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
```

---

## Step 6: Verify Everything Works

Run these commands to verify your resources exist and your credentials work:

```bash
# Test EC2 access
aws ec2 describe-instances --filters "Name=tag:Project,Values=cloud-cost-intel"

# Test CloudWatch access (get CPU for your EC2)
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=YOUR_INSTANCE_ID \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average

# Test Cost Explorer (may return empty if not yet 24 hours)
aws ce get-cost-and-usage \
  --time-period Start=$(date -u -d '7 days ago' +%Y-%m-%d),End=$(date -u +%Y-%m-%d) \
  --granularity DAILY \
  --metrics BlendedCost

# Test Lambda access
aws lambda list-functions

# Test EBS volumes
aws ec2 describe-volumes --filters "Name=tag:Project,Values=cloud-cost-intel"
```

---

## Cost Safety Checklist

- [ ] Billing alarm set at $5
- [ ] Using t2.micro (free tier)
- [ ] RDS is db.t3.micro (free tier)
- [ ] EBS volume is ≤ 30 GB total (free tier)
- [ ] Lambda has 128 MB memory (minimize cost)
- [ ] No NAT Gateway created (these cost $0.045/hr)
- [ ] No Elastic IP without an attached instance (these cost $0.005/hr when unattached)
- [ ] Clean up all resources after the hackathon

---

## Cleanup Script (Run After Hackathon)

```bash
# Stop and terminate EC2
aws ec2 terminate-instances --instance-ids YOUR_INSTANCE_ID

# Delete Lambda
aws lambda delete-function --function-name cost-intel-demo-function

# Delete S3 bucket
aws s3 rb s3://cost-intel-demo-bucket-YOUR_UNIQUE_ID --force

# Delete EBS volume
aws ec2 delete-volume --volume-id YOUR_VOLUME_ID

# Delete RDS
aws rds delete-db-instance \
  --db-instance-identifier cost-intel-demo-db \
  --skip-final-snapshot

# Delete IAM user (optional)
aws iam delete-user --user-name cost-intel-app
```
