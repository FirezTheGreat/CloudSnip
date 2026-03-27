import mongoose, { Schema, type Document } from "mongoose";

export interface IAnomaly extends Document {
  detected_at: Date;
  resource_id: string;
  resource_type: string;
  anomaly_type: string;
  severity: "low" | "medium" | "high" | "critical";
  anomaly_score: number;
  metric_snapshot?: Record<string, any>;
  description?: string;
  resolved: boolean;
  resolved_at?: Date;
  resolved_by?: string;
}

const AnomalySchema = new Schema<IAnomaly>(
  {
    detected_at: { type: Date, default: Date.now, index: true },
    resource_id: { type: String, required: true, index: true },
    resource_type: { type: String, required: true },
    anomaly_type: { type: String, required: true },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    anomaly_score: { type: Number, required: true },
    metric_snapshot: Schema.Types.Mixed,
    description: String,
    resolved: { type: Boolean, default: false, index: true },
    resolved_at: Date,
    resolved_by: String,
  },
  { timestamps: false }
);

export const Anomaly = mongoose.model<IAnomaly>("Anomaly", AnomalySchema);
