/**
 * Pricing Engine
 *
 * Realistic AWS-like pricing catalog for compute, storage, and network.
 * Every cost in the system flows through this module so numbers are
 * always explainable and traceable back to a published rate card.
 *
 * FORMULA:  cost = baseRate × usageFactor × hours × regionMultiplier
 */

// ─── Compute (EC2-style) ──────────────────────────────────────────────────────

export interface InstanceSpec {
  type: string;
  vCPUs: number;
  memoryGB: number;
  baseHourlyCost: number;   // USD/hr in us-east-1
  category: "general" | "compute" | "memory";
}

export const INSTANCE_CATALOG: Record<string, InstanceSpec> = {
  "t3.micro":    { type: "t3.micro",    vCPUs: 2,  memoryGB: 1,   baseHourlyCost: 0.0104, category: "general"  },
  "t3.small":    { type: "t3.small",    vCPUs: 2,  memoryGB: 2,   baseHourlyCost: 0.0208, category: "general"  },
  "t3.medium":   { type: "t3.medium",   vCPUs: 2,  memoryGB: 4,   baseHourlyCost: 0.0416, category: "general"  },
  "t3.large":    { type: "t3.large",    vCPUs: 2,  memoryGB: 8,   baseHourlyCost: 0.0832, category: "general"  },
  "m5.large":    { type: "m5.large",    vCPUs: 2,  memoryGB: 8,   baseHourlyCost: 0.096,  category: "memory"   },
  "m5.xlarge":   { type: "m5.xlarge",   vCPUs: 4,  memoryGB: 16,  baseHourlyCost: 0.192,  category: "memory"   },
  "c5.large":    { type: "c5.large",    vCPUs: 2,  memoryGB: 4,   baseHourlyCost: 0.085,  category: "compute"  },
  "c5.xlarge":   { type: "c5.xlarge",   vCPUs: 4,  memoryGB: 8,   baseHourlyCost: 0.17,   category: "compute"  },
  "c5.2xlarge":  { type: "c5.2xlarge",  vCPUs: 8,  memoryGB: 16,  baseHourlyCost: 0.34,   category: "compute"  },
  // Free-tier / micro
  "t3.nano":     { type: "t3.nano",     vCPUs: 2,  memoryGB: 0.5, baseHourlyCost: 0.0052, category: "general"  },
};

// ─── Storage (S3-style) ───────────────────────────────────────────────────────

export interface StorageTier {
  tier: string;
  costPerGBMonth: number;   // USD/GB-month
  description: string;
}

export const STORAGE_TIERS: Record<string, StorageTier> = {
  standard:   { tier: "standard",   costPerGBMonth: 0.023,   description: "S3 Standard — frequent access"     },
  infrequent: { tier: "infrequent", costPerGBMonth: 0.0125,  description: "S3 Infrequent Access"              },
  archive:    { tier: "archive",    costPerGBMonth: 0.004,    description: "S3 Glacier — long-term archive"    },
};

// Disk pricing (EBS-style)
export const DISK_PRICING: Record<string, number> = {
  "gp3":       0.08  / 730,   // $0.08/GB-month → $/hr
  "gp2":       0.10  / 730,
  "io1":       0.125 / 730,
  "st1":       0.045 / 730,
  "sc1":       0.015 / 730,
  "pd-standard": 0.04  / 730,   // GCP disk types retained for compat
  "pd-ssd":      0.17  / 730,
  "pd-balanced": 0.10  / 730,
};

// ─── Network ──────────────────────────────────────────────────────────────────

export const NETWORK_PRICING = {
  intraZonePerGB:   0.00,    // Free within same AZ
  crossRegionPerGB: 0.01,    // Inter-region transfer
  internetPerGB:    0.09,    // Public internet egress (first 10 TB tier)
};

// ─── Region Multipliers ──────────────────────────────────────────────────────

export const REGION_MULTIPLIERS: Record<string, number> = {
  "us-east-1":       1.00,
  "us-west-2":       1.00,
  "us-central1":     1.00,   // GCP equiv of us-east-1
  "eu-west-1":       1.08,
  "eu-central-1":    1.10,
  "ap-southeast-1":  1.15,
  "ap-northeast-1":  1.12,
  "sa-east-1":       1.25,
};

// ─── Cost Calculation Functions ───────────────────────────────────────────────

/**
 * Master cost formula:
 *   cost = baseRate × usageFactor × hours × regionMultiplier
 *
 * usageFactor: 0.0 (stopped) to 1.0 (maxed out).
 *   - Running instance: 1.0 (you pay regardless of CPU usage)
 *   - Stopped instance:  0.0 (compute free, but storage still billed)
 */
export function computeHourlyCost(
  instanceType: string,
  region: string = "us-east-1",
  usageFactor: number = 1.0
): number {
  const spec = INSTANCE_CATALOG[instanceType];
  if (!spec) return 0;
  const regionMult = REGION_MULTIPLIERS[region] ?? 1.0;
  return spec.baseHourlyCost * usageFactor * regionMult;
}

export function computeMonthlyCost(
  instanceType: string,
  region: string = "us-east-1",
  usageFactor: number = 1.0
): number {
  return computeHourlyCost(instanceType, region, usageFactor) * 730;
}

export function storageMonthlyCost(sizeGB: number, tier: string = "standard"): number {
  const tierInfo = STORAGE_TIERS[tier] || STORAGE_TIERS.standard;
  return sizeGB * tierInfo.costPerGBMonth;
}

export function storageHourlyCost(sizeGB: number, tier: string = "standard"): number {
  return storageMonthlyCost(sizeGB, tier) / 730;
}

export function diskHourlyCost(sizeGB: number, diskType: string = "gp3"): number {
  const rate = DISK_PRICING[diskType] ?? DISK_PRICING["gp3"];
  return sizeGB * rate;
}

export function networkCost(egressGB: number, type: "intra" | "cross" | "internet" = "internet"): number {
  switch (type) {
    case "intra":    return egressGB * NETWORK_PRICING.intraZonePerGB;
    case "cross":    return egressGB * NETWORK_PRICING.crossRegionPerGB;
    case "internet": return egressGB * NETWORK_PRICING.internetPerGB;
  }
}

/**
 * Look up the next-smaller instance for rightsizing recommendations.
 * Returns null if no downgrade exists.
 */
export function getDowngradeTarget(instanceType: string): { target: string; savingsPct: number } | null {
  const DOWNGRADE: Record<string, { target: string; savingsPct: number }> = {
    "c5.2xlarge":  { target: "c5.xlarge",  savingsPct: 50 },
    "c5.xlarge":   { target: "c5.large",   savingsPct: 50 },
    "c5.large":    { target: "t3.large",   savingsPct: 2  },
    "m5.xlarge":   { target: "m5.large",   savingsPct: 50 },
    "m5.large":    { target: "t3.large",   savingsPct: 13 },
    "t3.large":    { target: "t3.medium",  savingsPct: 50 },
    "t3.medium":   { target: "t3.small",   savingsPct: 50 },
    "t3.small":    { target: "t3.micro",   savingsPct: 50 },
    "t3.micro":    { target: "t3.nano",    savingsPct: 50 },
  };
  return DOWNGRADE[instanceType] ?? null;
}
