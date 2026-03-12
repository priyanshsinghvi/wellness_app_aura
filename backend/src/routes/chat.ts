import express from "express";
import {
  createChatSession,
  getChatSession,
  sendMessage,
  getChatHistory,
  getAllSessions,
  deleteSession,
} from "../controllers/chat";
import { auth } from "../middleware/auth";

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

// Create a new chat session
router.post("/sessions", createChatSession);

// Get a specific chat session
router.get("/sessions/:sessionId", getChatSession);

// Send a message in a chat session
router.post("/sessions/:sessionId/messages", sendMessage);

// Get chat history for a session
router.get("/sessions/:sessionId/history", getChatHistory);

// Get all chat sessions for user
router.get("/sessions", getAllSessions);

// Delete a specific chat session
router.delete("/sessions/:sessionId", deleteSession);

export default router;

// let response = pm.response.json()
// pm.globals.set("access_token", response.access_token)
