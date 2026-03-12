import express from "express";
import { auth } from "../middleware/auth";
import { logActivity, getUserActivities } from "../controllers/activityController";

const router = express.Router();

// All routes are protected with authentication
router.use(auth);

// Log a new activity
router.post("/", logActivity);

// Get user activity history
router.get("/", getUserActivities);

export default router;
