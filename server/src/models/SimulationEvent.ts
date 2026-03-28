import mongoose, { Schema, type Document } from "mongoose";

export interface ISimulationEvent extends Document {
  triggered_at: Date;
  scenario: string;
  resource_id: string;
  resource_name?: string;
  injected_points: number;
  gcp_action_taken: boolean;
  description: string;
  triggered_by: "auto" | "manual";
}

const SimulationEventSchema = new Schema<ISimulationEvent>(
  {
    triggered_at: { type: Date, default: Date.now, index: true },
    scenario: { type: String, required: true, index: true },
    resource_id: { type: String, required: true },
    resource_name: String,
    injected_points: { type: Number, default: 0 },
    gcp_action_taken: { type: Boolean, default: false },
    description: { type: String, required: true },
    triggered_by: { type: String, enum: ["auto", "manual"], default: "auto" },
  },
  { timestamps: false }
);

export const SimulationEvent = mongoose.model<ISimulationEvent>(
  "SimulationEvent",
  SimulationEventSchema
);
