import mongoose from "mongoose";
import { logger } from "./logger";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  logger.error("MONGODB_URI is not defined in environment variables");
  process.exit(1);
}

export const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    logger.info("Connected to MongoDB Atlas");
  } catch (error) {
    logger.error("MongoDB connection error:", error);
    process.exit(1);
  }
};
