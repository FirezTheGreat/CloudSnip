/**
 * Cost Classifier
 *
 * Classifies every resource into one of four cost-efficiency categories
 * based on its cost contribution to the fleet and its utilization level.
 *
 * Classification Matrix:
 *   HIGH COST + LOW USAGE  →  CRITICAL_WASTE
 *   HIGH COST + HIGH USAGE →  NECESSARY_EXPENSE
 *   LOW COST  + LOW USAGE  →  IGNORABLE
 *   LOW COST  + HIGH USAGE →  EFFICIENT
 */

import { INSTANCE_CATALOG } from "./pricing";

export type CostClassification =
  | "CRITICAL_WASTE"
  | "NECESSARY_EXPENSE"
  | "IGNORABLE"
  | "EFFICIENT";

export interface ClassificationResult {
  resourceId: string;
  resourceName: string;
  instanceType: string;
  classification: CostClassification;
  costContribution: number;    // % of total fleet cost
  efficiencyScore: number;     // 0..1  (weighted CPU+Mem vs provisioned)
  monthlyCost: number;
  avgCpu: number;
  avgMemory: number;
  reasoning: string;
}

// Weights for efficiency score calculation
const ALPHA = 0.6;  // CPU weight
const BETA  = 0.4;  // Memory weight

// Thresholds
const HIGH_COST_THRESHOLD = 0.15;     // > 15% of fleet = "high cost"
const LOW_USAGE_THRESHOLD  = 0.20;    // efficiency < 0.20 = "low usage"
const HIGH_USAGE_THRESHOLD = 0.50;    // efficiency > 0.50 = "high usage"

/**
 * Calculate the efficiency score for a single resource.
 *
 *   E = (α × avgCPU + β × avgMem) / provisionedCapacity
 *
 * provisionedCapacity is normalized to 100 (since CPU/mem are in %).
 */
export function efficiencyScore(avgCpu: number, avgMemory: number): number {
  const e = (ALPHA * avgCpu + BETA * avgMemory) / 100;
  return Math.max(0, Math.min(1, e));
}

/**
 * Classify a single resource.
 */
export function classifyResource(
  costContribution: number,
  efficiency: number
): CostClassification {
  const highCost = costContribution > HIGH_COST_THRESHOLD;
  const lowUsage = efficiency < LOW_USAGE_THRESHOLD;
  const highUsage = efficiency > HIGH_USAGE_THRESHOLD;

  if (highCost && lowUsage) return "CRITICAL_WASTE";
  if (highCost && highUsage) return "NECESSARY_EXPENSE";
  if (!highCost && lowUsage) return "IGNORABLE";
  if (!highCost && highUsage) return "EFFICIENT";

  // Edge case: moderate cost, moderate usage
  if (highCost) return "NECESSARY_EXPENSE";
  return "EFFICIENT";
}

/**
 * Classify an entire fleet.
 * Takes an array of resources with their average metrics and costs,
 * computes fleet-wide contributions, then classifies each.
 */
export interface ResourceInput {
  resourceId: string;
  resourceName: string;
  instanceType: string;
  hourlyCost: number;
  avgCpu: number;
  avgMemory: number;
  status: string;
}

export function classifyFleet(resources: ResourceInput[]): ClassificationResult[] {
  const totalMonthlyCost = resources.reduce(
    (sum, r) => sum + (r.status === "STOPPED" ? 0 : r.hourlyCost * 730),
    0
  );

  return resources.map((r) => {
    const monthlyCost = r.status === "STOPPED" ? 0 : r.hourlyCost * 730;
    const costContribution = totalMonthlyCost > 0 ? monthlyCost / totalMonthlyCost : 0;
    const efficiency = efficiencyScore(r.avgCpu, r.avgMemory);
    const classification = r.status === "STOPPED"
      ? "IGNORABLE" as CostClassification
      : classifyResource(costContribution, efficiency);

    const spec = INSTANCE_CATALOG[r.instanceType];
    const provisionedInfo = spec
      ? `${spec.vCPUs} vCPUs, ${spec.memoryGB}GB RAM`
      : r.instanceType;

    let reasoning: string;
    switch (classification) {
      case "CRITICAL_WASTE":
        reasoning = `Consuming ${(costContribution * 100).toFixed(1)}% of fleet budget ($${monthlyCost.toFixed(2)}/mo) but utilization is only ${(efficiency * 100).toFixed(0)}% of provisioned capacity (${provisionedInfo}). Immediate action recommended.`;
        break;
      case "NECESSARY_EXPENSE":
        reasoning = `High cost (${(costContribution * 100).toFixed(1)}% of fleet) but utilization at ${(efficiency * 100).toFixed(0)}% justifies the spend. ${provisionedInfo} is well-utilized.`;
        break;
      case "IGNORABLE":
        reasoning = `Low cost ($${monthlyCost.toFixed(2)}/mo, ${(costContribution * 100).toFixed(1)}% of fleet) and low utilization. Not worth optimizing — overhead exceeds potential savings.`;
        break;
      case "EFFICIENT":
        reasoning = `Good efficiency: ${(efficiency * 100).toFixed(0)}% utilization at $${monthlyCost.toFixed(2)}/mo. Well-rightsized ${provisionedInfo}.`;
        break;
    }

    return {
      resourceId: r.resourceId,
      resourceName: r.resourceName,
      instanceType: r.instanceType,
      classification,
      costContribution: Number(costContribution.toFixed(4)),
      efficiencyScore: Number(efficiency.toFixed(4)),
      monthlyCost: Number(monthlyCost.toFixed(2)),
      avgCpu: r.avgCpu,
      avgMemory: r.avgMemory,
      reasoning,
    };
  });
}
