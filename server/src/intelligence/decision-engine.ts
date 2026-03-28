/**
 * Smart Decision Engine
 *
 * Replaces blind "stop everything idle" with intelligent scoring.
 *
 * Decision Score formula:
 *   score = (costWeight × normalizedCost)
 *         + (usageWeight × inverseUsage)
 *         + (trendWeight × futureGrowthFactor)
 *
 * Rules:
 *   score > 0.75 AND classification == WASTE  →  STOP
 *   score > 0.50 AND classification == WASTE  →  DOWNSIZE
 *   classification == NECESSARY               →  KEEP
 *   futureGrowth > 0.6                        →  DO_NOT_STOP (override)
 *   classification == IGNORABLE               →  IGNORE
 */

import type { CostClassification } from "./cost-classifier";

export type DecisionAction = "STOP" | "DOWNSIZE" | "KEEP" | "IGNORE" | "MONITOR";

export interface DecisionResult {
  resourceId: string;
  resourceName: string;
  action: DecisionAction;
  score: number;                   // 0..1
  confidence: number;              // 0..100
  reasoning: string;
  savingsIfActed: number;          // monthly USD
  overrideReason?: string;         // why a stop was blocked
}

// Weights for the scoring formula
const COST_WEIGHT  = 0.40;
const USAGE_WEIGHT = 0.35;
const TREND_WEIGHT = 0.25;

export interface DecisionInput {
  resourceId: string;
  resourceName: string;
  classification: CostClassification;
  costContribution: number;         // 0..1 fraction of fleet cost
  efficiencyScore: number;          // 0..1
  monthlyCost: number;
  growthRate: number;               // % per day (from forecaster)
  trend: "increasing" | "decreasing" | "flat";
  workloadProfile: string;
  tags?: Record<string, string>;
}

/**
 * Compute the decision score and recommend an action.
 */
export function evaluateResource(input: DecisionInput): DecisionResult {
  // Normalize cost contribution to 0..1 (already a fraction)
  const normalizedCost = Math.min(1, input.costContribution * 5);  // scale: 20% = 1.0

  // Inverse usage: lower efficiency → higher score for action
  const inverseUsage = 1 - input.efficiencyScore;

  // Future growth factor: positive growth → lower score (don't stop growing services)
  const futureGrowth = Math.max(0, Math.min(1, input.growthRate / 10));

  // Raw score: higher means more wasteful
  let score = (COST_WEIGHT * normalizedCost)
            + (USAGE_WEIGHT * inverseUsage)
            - (TREND_WEIGHT * futureGrowth);  // Growth REDUCES the stop score

  score = Math.max(0, Math.min(1, score));

  // ─── Decision Logic ─────────────────────────────────────────────────

  let action: DecisionAction;
  let reasoning: string;
  let overrideReason: string | undefined;
  let savingsIfActed = 0;

  // Rule 1: Production/critical tags override everything
  const isProduction = input.tags?.env === "production" || input.tags?.env === "prod";
  const isProtected = input.tags?.["do-not-terminate"] === "true";

  if (isProtected) {
    action = "KEEP";
    reasoning = "Resource has 'do-not-terminate' tag — protected from automated actions.";
    overrideReason = "Protected by tag";
  }
  // Rule 2: Growing services — do not stop
  else if (futureGrowth > 0.6) {
    action = "MONITOR";
    reasoning = `Growth rate ${input.growthRate.toFixed(1)}%/day indicates this service is becoming critical. Monitoring instead of stopping.`;
    overrideReason = "Predicted growth — future critical service";
  }
  // Rule 3: Necessary expense
  else if (input.classification === "NECESSARY_EXPENSE") {
    action = "KEEP";
    reasoning = `High cost but justified by ${(input.efficiencyScore * 100).toFixed(0)}% utilization. This is a well-used resource.`;
  }
  // Rule 4: Critical waste — stop or downsize
  else if (input.classification === "CRITICAL_WASTE") {
    if (score > 0.75) {
      action = isProduction ? "DOWNSIZE" : "STOP";
      savingsIfActed = input.monthlyCost;
      reasoning = `Score ${score.toFixed(2)}: High cost (${(input.costContribution * 100).toFixed(1)}% of fleet) with only ${(input.efficiencyScore * 100).toFixed(0)}% utilization.${isProduction ? " Production env — recommending downsize instead of stop." : " Recommended: shut down."}`;
    } else {
      action = "DOWNSIZE";
      savingsIfActed = input.monthlyCost * 0.5;
      reasoning = `Score ${score.toFixed(2)}: Wasteful but score below critical threshold. Recommending rightsizing.`;
    }
  }
  // Rule 5: Ignorable — not worth the effort
  else if (input.classification === "IGNORABLE") {
    action = "IGNORE";
    reasoning = `Low cost ($${input.monthlyCost.toFixed(2)}/mo) and low usage. Optimization effort exceeds potential savings.`;
  }
  // Rule 6: Efficient — keep running
  else if (input.classification === "EFFICIENT") {
    action = "KEEP";
    reasoning = `Well-optimized: ${(input.efficiencyScore * 100).toFixed(0)}% utilization at $${input.monthlyCost.toFixed(2)}/mo. No action needed.`;
  }
  // Fallback
  else {
    action = "MONITOR";
    reasoning = `Score ${score.toFixed(2)}: Moderate cost/usage. Continue monitoring.`;
  }

  const confidence = Math.round(score * 100);

  return {
    resourceId: input.resourceId,
    resourceName: input.resourceName,
    action,
    score: Number(score.toFixed(4)),
    confidence,
    reasoning,
    savingsIfActed: Number(savingsIfActed.toFixed(2)),
    overrideReason,
  };
}

/**
 * Evaluate an entire fleet and return sorted decisions.
 */
export function evaluateFleet(inputs: DecisionInput[]): DecisionResult[] {
  return inputs
    .map(evaluateResource)
    .sort((a, b) => b.score - a.score);
}
