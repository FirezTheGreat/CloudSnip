import { Budget } from "./models/Budget";
import { Resource } from "./models/Resource";
import { broadcast } from "./socket-io";

export async function checkBudgets() {
  try {
    const budgets = await Budget.find().lean();
    if (budgets.length === 0) return;

    const allResources = await Resource.find({
      status: { $in: ["RUNNING", "active", "READY", "unattached"] },
    }).lean();

    for (const budget of budgets) {
      let monthlySpend = 0;

      if (budget.resource_type === "all") {
        monthlySpend = allResources.reduce((s, r) => s + (r.hourly_cost || 0) * 730, 0);
      } else {
        monthlySpend = allResources
          .filter((r) => r.resource_type === budget.resource_type)
          .reduce((s, r) => s + (r.hourly_cost || 0) * 730, 0);
      }

      const percentUsed = budget.monthly_limit > 0 ? (monthlySpend / budget.monthly_limit) * 100 : 0;
      const previousAlerts = budget.alerts_sent || [];

      const newAlerts: number[] = [];
      for (const threshold of budget.alert_thresholds || []) {
        if (percentUsed >= threshold && !previousAlerts.includes(threshold)) {
          newAlerts.push(threshold);
        }
      }

      await Budget.updateOne(
        { _id: budget._id },
        {
          $set: { current_spend: Number(monthlySpend.toFixed(2)), last_checked: new Date() },
          $addToSet: { alerts_sent: { $each: newAlerts } },
        }
      );

      for (const threshold of newAlerts) {
        broadcast({
          type: "budget_alert",
          data: {
            budget_name: budget.name,
            threshold,
            percent_used: Number(percentUsed.toFixed(1)),
            current_spend: Number(monthlySpend.toFixed(2)),
            monthly_limit: budget.monthly_limit,
            message: `Budget "${budget.name}" has reached ${percentUsed.toFixed(0)}% ($${monthlySpend.toFixed(2)} / $${budget.monthly_limit})`,
          },
        });

        console.log(`[Budget] ALERT: "${budget.name}" crossed ${threshold}% threshold (${percentUsed.toFixed(0)}%)`);
      }
    }
  } catch (err: any) {
    console.error("[Budget] Check error:", err.message);
  }
}
