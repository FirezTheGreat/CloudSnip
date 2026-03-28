/**
 * Workload Profiles
 *
 * Every resource is assigned one of four deterministic workload archetypes.
 * Instead of random spikes, each profile generates metric values that follow
 * a realistic statistical distribution (mean ± std-dev with optional
 * time-of-day seasonality).
 *
 * The simulator uses these profiles to produce metrics that the ML model
 * and cost classifier can interpret consistently.
 */

export type WorkloadProfile = "idle" | "stable" | "high_load" | "spiky";

export interface ProfileSpec {
  profile: WorkloadProfile;
  label: string;
  description: string;
  cpu: { mean: number; stdDev: number };      // % utilization
  memory: { mean: number; stdDev: number };    // % utilization
  networkIn: { mean: number; stdDev: number }; // bytes/s
  networkOut: { mean: number; stdDev: number };// bytes/s
}

export const WORKLOAD_PROFILES: Record<WorkloadProfile, ProfileSpec> = {
  idle: {
    profile: "idle",
    label: "Idle Service",
    description: "Near-zero CPU/memory — candidate for shutdown",
    cpu:        { mean: 3,    stdDev: 1.5  },
    memory:     { mean: 8,    stdDev: 3    },
    networkIn:  { mean: 500,  stdDev: 200  },
    networkOut: { mean: 200,  stdDev: 100  },
  },
  stable: {
    profile: "stable",
    label: "Stable Service",
    description: "Predictable moderate usage — healthy workload",
    cpu:        { mean: 32,     stdDev: 8    },
    memory:     { mean: 45,     stdDev: 10   },
    networkIn:  { mean: 25000,  stdDev: 5000 },
    networkOut: { mean: 15000,  stdDev: 3000 },
  },
  high_load: {
    profile: "high_load",
    label: "High-Load Service",
    description: "Critical system under heavy sustained load",
    cpu:        { mean: 78,      stdDev: 7     },
    memory:     { mean: 72,      stdDev: 8     },
    networkIn:  { mean: 150000,  stdDev: 30000 },
    networkOut: { mean: 80000,   stdDev: 15000 },
  },
  spiky: {
    profile: "spiky",
    label: "Spiky Workload",
    description: "Burst-traffic pattern with high variance",
    cpu:        { mean: 25,     stdDev: 35    },
    memory:     { mean: 30,     stdDev: 25    },
    networkIn:  { mean: 50000,  stdDev: 80000 },
    networkOut: { mean: 30000,  stdDev: 50000 },
  },
};

/**
 * Generate a single metric value for a given profile and metric type.
 * Uses Box-Muller transform for Gaussian distribution, then clamps.
 *
 * @param hourOfDay  0-23 — used for time-of-day seasonality
 */
export function generateMetricValue(
  profile: WorkloadProfile,
  metricName: "cpu" | "memory" | "networkIn" | "networkOut",
  hourOfDay: number = new Date().getHours()
): number {
  const spec = WORKLOAD_PROFILES[profile];
  if (!spec) return 0;

  const { mean, stdDev } = spec[metricName];

  // Box-Muller transform for normally distributed random
  const u1 = Math.random() || 0.0001;
  const u2 = Math.random();
  const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

  // Time-of-day seasonality: business hours (9-17) boost by 15%, night (0-6) reduce by 20%
  let seasonality = 1.0;
  if (hourOfDay >= 9 && hourOfDay <= 17) seasonality = 1.15;
  else if (hourOfDay <= 6 || hourOfDay >= 22) seasonality = 0.80;

  let value = (mean + gaussian * stdDev) * seasonality;

  // Clamp: CPU/memory to [0, 100], network to [0, ∞)
  if (metricName === "cpu" || metricName === "memory") {
    value = Math.max(0, Math.min(100, value));
  } else {
    value = Math.max(0, value);
  }

  return Number(value.toFixed(2));
}

/**
 * Generate a full set of metrics for one timestep.
 */
export function generateMetricSnapshot(
  profile: WorkloadProfile,
  hourOfDay?: number
): { cpuUtilization: number; memoryUtilization: number; networkIn: number; networkOut: number } {
  return {
    cpuUtilization: generateMetricValue(profile, "cpu", hourOfDay),
    memoryUtilization: generateMetricValue(profile, "memory", hourOfDay),
    networkIn: generateMetricValue(profile, "networkIn", hourOfDay),
    networkOut: generateMetricValue(profile, "networkOut", hourOfDay),
  };
}

/**
 * Classify a resource into a workload profile based on observed metrics.
 * Uses the statistical rules from the optimization design doc.
 */
export function classifyWorkload(avgCpu: number, stdDevCpu: number): WorkloadProfile {
  if (avgCpu < 5 && stdDevCpu < 2) return "idle";
  if (stdDevCpu > 30) return "spiky";
  if (avgCpu > 75) return "high_load";
  if (avgCpu > 20 && stdDevCpu < 15) return "stable";
  // Fallback: low usage but moderate variance — treat as idle
  if (avgCpu < 10) return "idle";
  return "stable";
}

/**
 * Calculate Peak-to-Average Ratio (PAR) for spiky detection.
 */
export function peakToAverageRatio(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const max = Math.max(...values);
  return max / mean;
}
