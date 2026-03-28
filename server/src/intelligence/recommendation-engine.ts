/**
 * Recommendation Engine
 *
 * Generates actionable recommendations with real savings estimates:
 *   1. Instance downsizing  (based on avg CPU + workload profile)
 *   2. Storage tier changes  (based on access patterns)
 *   3. What-if simulation   ("what if we stopped X?")
 */

import { INSTANCE_CATALOG, getDowngradeTarget, computeMonthlyCost, STORAGE_TIERS } from "./pricing";
import type { CostClassification } from "./cost-classifier";
import type { WorkloadProfile } from "./workload-profiles";

export interface Recommendation {
  id: string;
  type: "rightsize" | "stop_idle" | "delete_unused" | "change_tier" | "reserve";
  resourceId: string;
  resourceName: string;
  resourceType: string;
  currentConfig: string;
  recommendedConfig: string;
  reason: string;
  estimatedMonthlySavings: number;
  confidence: "high" | "medium" | "low";
  classification: CostClassification;
  workloadProfile: WorkloadProfile;
}

export interface RecommendationInput {
  resourceId: string;
  resourceName: string;
  resourceType: string;
  instanceType: string;
  region: string;
  hourlyCost: number;
  avgCpu: number;
  maxCpu: number;
  avgMemory: number;
  status: string;
  classification: CostClassification;
  workloadProfile: WorkloadProfile;
  storageTier?: string;
  storageGB?: number;
  diskType?: string;
  diskSizeGB?: number;
}

/**
 * Generate all applicable recommendations for a resource.
 */
export function generateRecommendations(resource: RecommendationInput): Recommendation[] {
  const recs: Recommendation[] = [];

  // ─── 1. Compute Rightsizing ────────────────────────────────────────
  if (resource.resourceType === "compute" && resource.status === "RUNNING") {
    const currentSpec = INSTANCE_CATALOG[resource.instanceType];

    // Stop idle: very low CPU for idle workload profile
    if (resource.workloadProfile === "idle" && resource.avgCpu < 5 && resource.classification === "CRITICAL_WASTE") {
      recs.push({
        id: `stop-${resource.resourceId}`,
        type: "stop_idle",
        resourceId: resource.resourceId,
        resourceName: resource.resourceName,
        resourceType: "compute",
        currentConfig: resource.instanceType,
        recommendedConfig: "STOPPED",
        reason: `Idle workload profile: avg CPU ${resource.avgCpu.toFixed(1)}% — this instance is doing nothing. Estimated cost: $${(resource.hourlyCost * 730).toFixed(2)}/mo wasted.`,
        estimatedMonthlySavings: Number((resource.hourlyCost * 730).toFixed(2)),
        confidence: "high",
        classification: resource.classification,
        workloadProfile: resource.workloadProfile,
      });
    }

    // Downsize: low CPU on a rightsize-able instance
    const downgrade = getDowngradeTarget(resource.instanceType);
    if (downgrade && resource.avgCpu < 30 && resource.maxCpu < 60 && resource.workloadProfile !== "spiky") {
      const currentMonthly = computeMonthlyCost(resource.instanceType, resource.region);
      const targetMonthly = computeMonthlyCost(downgrade.target, resource.region);
      const savings = currentMonthly - targetMonthly;

      if (savings > 0.50) {  // Only recommend if savings > $0.50/mo
        recs.push({
          id: `rightsize-${resource.resourceId}`,
          type: "rightsize",
          resourceId: resource.resourceId,
          resourceName: resource.resourceName,
          resourceType: "compute",
          currentConfig: resource.instanceType,
          recommendedConfig: downgrade.target,
          reason: `Avg CPU ${resource.avgCpu.toFixed(1)}% (max ${resource.maxCpu.toFixed(1)}%) — current ${resource.instanceType}${currentSpec ? ` (${currentSpec.vCPUs} vCPUs)` : ""} is overprovisioned. ${downgrade.target} provides sufficient capacity.`,
          estimatedMonthlySavings: Number(savings.toFixed(2)),
          confidence: resource.avgCpu < 10 ? "high" : resource.avgCpu < 20 ? "medium" : "low",
          classification: resource.classification,
          workloadProfile: resource.workloadProfile,
        });
      }
    }
  }

  // ─── 2. Storage Tier Optimization ──────────────────────────────────
  if (resource.resourceType === "gcs" && resource.storageTier === "standard" && resource.storageGB) {
    // If low access pattern, suggest infrequent or archive
    const currentCost = resource.storageGB * STORAGE_TIERS.standard.costPerGBMonth;
    const infrequentCost = resource.storageGB * STORAGE_TIERS.infrequent.costPerGBMonth;
    const savings = currentCost - infrequentCost;

    if (savings > 0.10) {
      recs.push({
        id: `tier-${resource.resourceId}`,
        type: "change_tier",
        resourceId: resource.resourceId,
        resourceName: resource.resourceName,
        resourceType: "gcs",
        currentConfig: "Standard",
        recommendedConfig: "Infrequent Access",
        reason: `${resource.storageGB}GB in Standard tier. If accessed less than once/month, Infrequent Access saves $${savings.toFixed(2)}/mo.`,
        estimatedMonthlySavings: Number(savings.toFixed(2)),
        confidence: "medium",
        classification: resource.classification,
        workloadProfile: resource.workloadProfile,
      });
    }
  }

  // ─── 3. Unused Disk Cleanup ────────────────────────────────────────
  if (resource.resourceType === "disk" && resource.status === "unattached") {
    const monthlyCost = resource.hourlyCost * 730;
    if (monthlyCost > 0) {
      recs.push({
        id: `cleanup-${resource.resourceId}`,
        type: "delete_unused",
        resourceId: resource.resourceId,
        resourceName: resource.resourceName,
        resourceType: "disk",
        currentConfig: `${resource.diskSizeGB || "?"}GB ${resource.diskType || "standard"}`,
        recommendedConfig: "DELETE",
        reason: `Unattached disk costing $${monthlyCost.toFixed(2)}/month with no workload attached.`,
        estimatedMonthlySavings: Number(monthlyCost.toFixed(2)),
        confidence: "high",
        classification: resource.classification,
        workloadProfile: resource.workloadProfile,
      });
    }
  }

  return recs;
}

/**
 * What-If Simulation: project the cost impact of an action.
 */
export interface WhatIfResult {
  scenarioLabel: string;
  currentMonthlyCost: number;
  projectedMonthlyCost: number;
  monthlySavings: number;
  annualSavings: number;
  riskLevel: "low" | "medium" | "high";
  explanation: string;
}

export function simulateWhatIf(
  resourceName: string,
  instanceType: string,
  hourlyCost: number,
  region: string,
  scenario: "stop" | "downsize" | "change_tier",
  workloadProfile: WorkloadProfile
): WhatIfResult {
  const currentMonthly = hourlyCost * 730;

  switch (scenario) {
    case "stop": {
      const risk = workloadProfile === "high_load" ? "high" : workloadProfile === "stable" ? "medium" : "low";
      return {
        scenarioLabel: `Stop ${resourceName}`,
        currentMonthlyCost: currentMonthly,
        projectedMonthlyCost: 0,
        monthlySavings: currentMonthly,
        annualSavings: currentMonthly * 12,
        riskLevel: risk,
        explanation: `Stopping ${resourceName} (${instanceType}) eliminates $${currentMonthly.toFixed(2)}/mo. Risk: ${risk} — workload is ${workloadProfile}.`,
      };
    }
    case "downsize": {
      const downgrade = getDowngradeTarget(instanceType);
      if (!downgrade) {
        return {
          scenarioLabel: `Downsize ${resourceName}`,
          currentMonthlyCost: currentMonthly,
          projectedMonthlyCost: currentMonthly,
          monthlySavings: 0,
          annualSavings: 0,
          riskLevel: "low",
          explanation: `No smaller instance available for ${instanceType}.`,
        };
      }
      const newMonthly = computeMonthlyCost(downgrade.target, region);
      return {
        scenarioLabel: `Downsize ${resourceName}: ${instanceType} → ${downgrade.target}`,
        currentMonthlyCost: currentMonthly,
        projectedMonthlyCost: newMonthly,
        monthlySavings: currentMonthly - newMonthly,
        annualSavings: (currentMonthly - newMonthly) * 12,
        riskLevel: "medium",
        explanation: `Rightsizing from ${instanceType} to ${downgrade.target} saves $${(currentMonthly - newMonthly).toFixed(2)}/mo while maintaining capacity for current workload.`,
      };
    }
    case "change_tier": {
      return {
        scenarioLabel: `Change tier for ${resourceName}`,
        currentMonthlyCost: currentMonthly,
        projectedMonthlyCost: currentMonthly * 0.54,  // ~46% savings moving standard→infrequent
        monthlySavings: currentMonthly * 0.46,
        annualSavings: currentMonthly * 0.46 * 12,
        riskLevel: "low",
        explanation: `Moving to Infrequent Access tier saves ~46% on storage costs.`,
      };
    }
  }
}
