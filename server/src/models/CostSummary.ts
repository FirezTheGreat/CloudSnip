import mongoose, { Schema, type Document } from "mongoose";

export interface ICostSummary extends Document {
  time: Date;
  service: string;
  total_cost: number;
  currency: string;
  resource_count: number;
}

const CostSummarySchema = new Schema<ICostSummary>(
  {
    time: { type: Date, required: true, index: true },
    service: { type: String, required: true },
    total_cost: { type: Number, required: true },
    currency: { type: String, default: "USD" },
    resource_count: { type: Number, default: 0 },
  },
  { timestamps: false }
);

CostSummarySchema.index({ service: 1, time: -1 });

export const CostSummary = mongoose.model<ICostSummary>("CostSummary", CostSummarySchema);
