import mongoose, { Schema, type Document } from "mongoose";

export interface IResource extends Document {
  resource_id: string;
  resource_type: string;
  name?: string;
  status?: string;
  region?: string;
  tags?: Record<string, any>;
  hourly_cost: number;
  first_seen: Date;
  last_seen: Date;
  metadata?: Record<string, any>;
  // ─── New Intelligence Fields ───────────────────────────
  instanceType?: string;                 // e.g. "t3.medium", "m5.large"
  workloadProfile?: string;              // "idle" | "stable" | "high_load" | "spiky"
  classification?: string;              // "CRITICAL_WASTE" | "NECESSARY_EXPENSE" | "EFFICIENT" | "IGNORABLE"
  predictedUsage?: {
    next24hAvgCpu?: number;
    next7dAvgCpu?: number;
    trend?: string;
    growthRate?: number;
  };
  costContribution?: number;             // fraction of total fleet cost (0..1)
  efficiencyScore?: number;              // 0..1
}

const ResourceSchema = new Schema<IResource>(
  {
    resource_id: { type: String, required: true, unique: true },
    resource_type: { type: String, required: true, index: true },
    name: String,
    status: String,
    region: { type: String, default: "us-east-1" },
    tags: Schema.Types.Mixed,
    hourly_cost: { type: Number, default: 0 },
    first_seen: { type: Date, default: Date.now },
    last_seen: { type: Date, default: Date.now },
    metadata: Schema.Types.Mixed,
    // Intelligence fields
    instanceType: String,
    workloadProfile: { type: String, enum: ["idle", "stable", "high_load", "spiky"], index: true },
    classification: { type: String, enum: ["CRITICAL_WASTE", "NECESSARY_EXPENSE", "EFFICIENT", "IGNORABLE"], index: true },
    predictedUsage: Schema.Types.Mixed,
    costContribution: Number,
    efficiencyScore: Number,
  },
  { timestamps: false }
);

export const Resource = mongoose.model<IResource>("Resource", ResourceSchema);
