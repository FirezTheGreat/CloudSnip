import {
  GetCostAndUsageCommand,
  type GetCostAndUsageCommandInput,
} from "@aws-sdk/client-cost-explorer";
import { costExplorer } from "../config";
import { query } from "../db";

export async function collectCostData() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  const input: GetCostAndUsageCommandInput = {
    TimePeriod: {
      Start: formatDate(sevenDaysAgo),
      End: formatDate(now),
    },
    Granularity: "DAILY",
    Metrics: ["BlendedCost", "UnblendedCost", "UsageQuantity"],
    GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" }],
  };

  try {
    const cmd = new GetCostAndUsageCommand(input);
    const response = await costExplorer.send(cmd);

    let insertCount = 0;

    for (const result of response.ResultsByTime || []) {
      const timeStart = result.TimePeriod?.Start;
      if (!timeStart) continue;

      for (const group of result.Groups || []) {
        const service = group.Keys?.[0] || "Unknown";
        const cost = parseFloat(group.Metrics?.BlendedCost?.Amount || "0");

        if (cost === 0) continue;

        await query(
          `INSERT INTO cost_summaries (time, service, total_cost)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [new Date(timeStart), service, cost]
        );

        insertCount++;
      }
    }

    console.log(`[CostExplorer] Collected ${insertCount} cost records for last 7 days`);
    return insertCount;
  } catch (err: any) {
    if (err.name === "DataUnavailableException") {
      console.warn("[CostExplorer] Cost data not yet available — enable Cost Explorer and wait 24 hours");
    } else {
      console.error("[CostExplorer] Error:", err.message);
    }
    return 0;
  }
}
