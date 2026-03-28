import mongoose, { Schema, type Document } from "mongoose";

export interface IMetric extends Document {
  time: Date;
  resource_id: string;
  resource_type: string;
  metric_name: string;
  value: number;
  unit?: string;
  region?: string;
}

const MetricSchema = new Schema<IMetric>(
  {
    time: { type: Date, required: true, index: true },
    resource_id: { type: String, required: true, index: true },
    resource_type: { type: String, required: true },
    metric_name: { type: String, required: true },
    value: { type: Number, required: true },
    unit: String,
    region: { type: String, default: "us-central1" },
  },
  { timestamps: false }
);

MetricSchema.index({ resource_type: 1, metric_name: 1, time: -1 });
MetricSchema.index({ time: -1, resource_id: 1 });
// TTL index: automatically expire metrics older than 30 days (time-series housekeeping)
MetricSchema.index({ time: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60, name: "metrics_ttl_30d" });

export const Metric = mongoose.model<IMetric>("Metric", MetricSchema);
