import mongoose, { Schema, type Document } from "mongoose";

export interface IBudget extends Document {
  name: string;
  resource_type: string;
  monthly_limit: number;
  alert_thresholds: number[];
  current_spend: number;
  last_checked: Date;
  alerts_sent: number[];
  created_at: Date;
}

const BudgetSchema = new Schema<IBudget>(
  {
    name: { type: String, required: true },
    resource_type: { type: String, default: "all" },
    monthly_limit: { type: Number, required: true },
    alert_thresholds: { type: [Number], default: [50, 80, 100] },
    current_spend: { type: Number, default: 0 },
    last_checked: { type: Date, default: Date.now },
    alerts_sent: { type: [Number], default: [] },
    created_at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

export const Budget = mongoose.model<IBudget>("Budget", BudgetSchema);
