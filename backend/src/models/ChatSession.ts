import { Document, Schema, model, Types } from "mongoose";

export interface IChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  metadata?: {
    analysis?: any;
    currentGoal?: string | null;
    sentiment?: {
      label: string;           // "POSITIVE" | "NEGATIVE" | "NEUTRAL"
      score: number;           // 0.0 to 1.0 — confidence of the label
      crisisTriggered: boolean; // true if NEGATIVE score > 0.85
    };
    progress?: {
      emotionalState?: string;
      riskLevel?: number;
    };
  };
}

export interface IChatSession extends Document {
  _id: Types.ObjectId;
  sessionId: string;
  userId: Types.ObjectId;
  startTime: Date;
  status: "active" | "completed" | "archived";
  messages: IChatMessage[];
}

const chatMessageSchema = new Schema<IChatMessage>({
  role: { type: String, required: true, enum: ["user", "assistant"] },
  content: { type: String, required: true },
  timestamp: { type: Date, required: true },
  metadata: {
    analysis: Schema.Types.Mixed,
    currentGoal: String,
    sentiment: {              // NEW — stores HuggingFace sentiment result
      label: String,          // "POSITIVE", "NEGATIVE", or "NEUTRAL"
      score: Number,          // e.g. 0.9231
      crisisTriggered: Boolean, // true if high distress detected
    },
    progress: {
      emotionalState: String,
      riskLevel: Number,
    },
  },
});

const chatSessionSchema = new Schema<IChatSession>({
  sessionId: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  startTime: { type: Date, required: true },
  status: {
    type: String,
    required: true,
    enum: ["active", "completed", "archived"],
  },
  messages: [chatMessageSchema],
});

export const ChatSession = model<IChatSession>(
  "ChatSession",
  chatSessionSchema
);