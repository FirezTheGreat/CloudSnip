import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IAction extends Document {
  executed_at: Date;
  anomaly_id?: Types.ObjectId;
  resource_id: string;
  resource_type: string;
  action_type: string;
  status: string;
  cost_before_hourly?: number;
  cost_after_hourly?: number;
  savings_hourly?: number;
  savings_monthly_projected?: number;
  details?: Record<string, any>;
  dry_run: boolean;
}

const ActionSchema = new Schema<IAction>(
  {
    executed_at: { type: Date, default: Date.now, index: true },
    anomaly_id: { type: Schema.Types.ObjectId, ref: "Anomaly" },
    resource_id: { type: String, required: true, index: true },
    resource_type: { type: String, required: true },
    action_type: { type: String, required: true },
    status: { type: String, default: "pending" },
    cost_before_hourly: Number,
    cost_after_hourly: Number,
    savings_hourly: Number,
    savings_monthly_projected: Number,
    details: Schema.Types.Mixed,
    dry_run: { type: Boolean, default: false },
  },
  { timestamps: false }
);

export const Action = mongoose.model<IAction>("Action", ActionSchema);
