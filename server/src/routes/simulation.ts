import { Router } from "express";
import {
  triggerScenario,
  runAutoSimulation,
  ALL_SCENARIOS,
  type ScenarioType,
} from "../simulation/anomaly-simulator";
import { SimulationEvent } from "../models/SimulationEvent";

const router = Router();

/**
 * GET /api/simulation/scenarios
 * List all available scenario types with descriptions.
 */
router.get("/scenarios", (_req, res) => {
  const descriptions: Record<ScenarioType, string> = {
    idle_instance:
      "Inject near-zero CPU metrics for a running VM. Triggers idle-instance detection → optimizer stops the VM.",
    runaway_function:
      "Inject a 30× invocation-count spike for a Cloud Function. Triggers runaway-function detection → optimizer caps max instances.",
    orphan_disk:
      "Mark an unattached disk and inject anomaly metrics. Triggers unused-volume detection → optimizer deletes the disk.",
    traffic_spike:
      "Inject a 25× network-traffic surge on a VM. Triggers traffic-spike detection → resource gets labelled for review.",
    cost_spike:
      "Temporarily inflate a resource's hourly cost 4.5×. Triggers cost-spike detection → resource labelled + alert sent.",
  };

  res.json({
    scenarios: ALL_SCENARIOS.map((s) => ({
      id: s,
      description: descriptions[s],
    })),
  });
});

/**
 * POST /api/simulation/trigger
 * Manually fire a specific scenario.
 * Body: { scenario: "idle_instance" | "runaway_function" | ... }
 */
router.post("/trigger", async (req, res) => {
  const { scenario } = req.body as { scenario?: ScenarioType };

  if (!scenario) {
    return res.status(400).json({ error: "scenario is required" });
  }

  if (!ALL_SCENARIOS.includes(scenario)) {
    return res.status(400).json({
      error: `Unknown scenario "${scenario}". Valid: ${ALL_SCENARIOS.join(", ")}`,
    });
  }

  try {
    const result = await triggerScenario(scenario);

    if (!result) {
      return res.status(409).json({
        error:
          "Scenario skipped — no eligible resource found or a simulation is already running for that resource. Try again in 60s.",
      });
    }

    return res.json({ success: true, result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/simulation/auto
 * Trigger one automatic simulation cycle (picks scenario randomly).
 */
router.post("/auto", async (_req, res) => {
  try {
    await runAutoSimulation();
    return res.json({ success: true, message: "Auto-simulation cycle executed" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/simulation/history
 * Return the last N simulation events.
 */
router.get("/history", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const events = await SimulationEvent.find()
      .sort({ triggered_at: -1 })
      .limit(limit)
      .lean();

    return res.json({ data: events });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
