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
}

const ResourceSchema = new Schema<IResource>(
  {
    resource_id: { type: String, required: true, unique: true },
    resource_type: { type: String, required: true, index: true },
    name: String,
    status: String,
    region: { type: String, default: "us-central1" },
    tags: Schema.Types.Mixed,
    hourly_cost: { type: Number, default: 0 },
    first_seen: { type: Date, default: Date.now },
    last_seen: { type: Date, default: Date.now },
    metadata: Schema.Types.Mixed,
  },
  { timestamps: false }
);

export const Resource = mongoose.model<IResource>("Resource", ResourceSchema);
