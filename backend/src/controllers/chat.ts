import { Request, Response } from "express";
import { ChatSession, IChatSession } from "../models/ChatSession";
import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger";
import { inngest } from "../inngest/client";
import { User } from "../models/User";
import { InngestSessionResponse, InngestEvent } from "../types/inngest";
import { Types } from "mongoose";

// ─── SENTIMENT ANALYSIS FUNCTION ───────────────────────────
// This calls HuggingFace's free API to analyze the emotion
// in a user's message. Returns a label (POSITIVE/NEGATIVE/NEUTRAL)
// and a confidence score between 0 and 1.

const analyzeSentiment = async (text: string) => {
  try {
    const response = await fetch(
      "https://router.huggingface.co/hf-inference/models/cardiffnlp/twitter-roberta-base-sentiment-latest",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: text }),
      }
    );

    const result = await response.json();

    // HuggingFace returns an array of arrays like:
    // [[{label: "POSITIVE", score: 0.92}, {label: "NEGATIVE", score: 0.05}, ...]]
    // We flatten it and find the highest scoring label
    const scores = Array.isArray(result[0]) ? result[0] : result;
    const top = scores.sort((a: any, b: any) => b.score - a.score)[0];
    const topLabel = top?.label ? top.label.toUpperCase() : "NEUTRAL";

    // Crisis is triggered if sentiment is very negative (score above 0.85)
    const crisisTriggered = topLabel === "NEGATIVE" && top?.score > 0.85;

    return {
      label: topLabel,   // POSITIVE, NEGATIVE, or NEUTRAL
      score: parseFloat((top?.score || 0).toFixed(4)),  // e.g. 0.9231
      crisisTriggered,                  // true if high distress detected
    };

  } catch (error) {
    // If HuggingFace fails, we don't crash the app
    // We just return a neutral default and log the warning
    logger.warn("HuggingFace sentiment analysis failed:", error);
    return {
      label: "NEUTRAL",
      score: 0,
      crisisTriggered: false,
    };
  }
};
// ────────────────────────────────────────────────────────────
// Initialize OpenAI API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Create a new chat session
export const createChatSession = async (req: Request, res: Response) => {
  try {
    // Check if user is authenticated
    if (!req.user || !req.user.id) {
      return res
        .status(401)
        .json({ message: "Unauthorized - User not authenticated" });
    }

    const userId = new Types.ObjectId(req.user.id);
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate a unique sessionId
    const sessionId = uuidv4();

    const session = new ChatSession({
      sessionId,
      userId,
      startTime: new Date(),
      status: "active",
      messages: [],
    });

    await session.save();

    res.status(201).json({
      message: "Chat session created successfully",
      sessionId: session.sessionId,
    });
  } catch (error) {
    logger.error("Error creating chat session:", error);
    res.status(500).json({
      message: "Error creating chat session",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Send a message in the chat session
export const sendMessage = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;
    // Run sentiment analysis on the user's message
    // This happens before the AI response is generated
    const sentimentResult = await analyzeSentiment(message);
    logger.info(`Sentiment detected: ${sentimentResult.label} (score: ${sentimentResult.score})`);

    const userId = new Types.ObjectId(req.user.id);

    // If crisis is detected, log a warning
    // In future you can add email alerts or emergency resource triggers here
    if (sentimentResult.crisisTriggered) {
      logger.warn("CRISIS DETECTED via sentiment analysis", {
        userId: userId.toString(),
        sessionId,
        sentimentScore: sentimentResult.score,
        message: message.substring(0, 50), // log only first 50 chars for privacy
      });
    }

    logger.info("Processing message:", { sessionId, message });

    // Find session by sessionId
    const session = await ChatSession.findOne({ sessionId });
    if (!session) {
      logger.warn("Session not found:", { sessionId });
      return res.status(404).json({ message: "Session not found" });
    }

    if (session.userId.toString() !== userId.toString()) {
      logger.warn("Unauthorized access attempt:", { sessionId, userId });
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Create Inngest event for message processing
    const event: InngestEvent = {
      name: "therapy/session.message",
      data: {
        message,
        history: session.messages,
        memory: {
          userProfile: {
            emotionalState: [],
            riskLevel: 0,
            preferences: {},
          },
          sessionContext: {
            conversationThemes: [],
            currentTechnique: null,
          },
        },
        goals: [],
        systemPrompt: `You are an AI therapist assistant. Your role is to:
        1. Provide empathetic and supportive responses
        2. Use evidence-based therapeutic techniques
        3. Maintain professional boundaries
        4. Monitor for risk factors
        5. Guide users toward their therapeutic goals`,
      },
    };

    logger.info("Sending message to Inngest:", { event });

    // Send event to Inngest for logging and analytics (non-critical, catch errors)
    try {
      await inngest.send(event);
    } catch (inngestError) {
      logger.warn("Inngest send failed (non-critical):", inngestError);
    }

    // Process the message using OpenAI
    let analysis;
    let aiResponse: string;

    try {
      // Analyze the message using JSON mode
      const analysisPrompt = `Analyze this therapy message and provide insights. You MUST return ONLY a valid JSON object matching exactly this schema, with no markdown formatting or additional text.
      
      Message: ${message}
      
      Required JSON structure:
      {
        "emotionalState": "string",
        "themes": ["string"],
        "riskLevel": number,
        "recommendedApproach": "string",
        "progressIndicators": ["string"]
      }`;

      const analysisCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Use gpt-4o-mini as a fast, cost-effective default, or use gpt-4o for best results
        messages: [{ role: "user", content: analysisPrompt }],
        response_format: { type: "json_object" },
      });

      const analysisText = analysisCompletion.choices[0].message.content || "{}";

      try {
        analysis = JSON.parse(analysisText);
      } catch (parseError) {
        logger.warn("Failed to parse OpenAI analysis JSON:", parseError);
        analysis = {
          emotionalState: "neutral",
          themes: [],
          riskLevel: 0,
          recommendedApproach: "supportive listening",
          progressIndicators: [],
        };
      }

      // Generate therapeutic response
      const responseCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: event.data.systemPrompt || "You are an AI therapist assistant." },
          {
            role: "user",
            content: `Based on the following context, generate a therapeutic response:
            Message: ${message}
            Analysis: ${JSON.stringify(analysis)}
            
            Provide a response that:
            1. Addresses the immediate emotional needs
            2. Uses appropriate therapeutic techniques
            3. Shows empathy and understanding
            4. Maintains professional boundaries
            5. Considers safety and well-being`
          }
        ],
      });

      aiResponse = responseCompletion.choices[0].message.content || "I am here for you.";

    } catch (openAiError: any) {
      logger.error("OpenAI API error:", openAiError?.message || openAiError);
      return res.status(503).json({
        message: "AI service temporarily unavailable. Please try again in a moment.",
        error: "OPENAI_ERROR",
      });
    }

    logger.info("Generated response:", aiResponse);


    // Add message to session history
    session.messages.push({
      role: "user",
      content: message,
      timestamp: new Date(),
      metadata: {
        sentiment: sentimentResult,  // saves label, score, crisisTriggered
      },
    });

    session.messages.push({
      role: "assistant",
      content: aiResponse,
      timestamp: new Date(),
      metadata: {
        analysis,
        progress: {
          emotionalState: analysis?.emotionalState,
          riskLevel: analysis?.riskLevel,
        },
      },
    });

    // Save the updated session
    await session.save();
    logger.info("Session updated successfully:", { sessionId });

    // Return the response
    res.json({
      response: aiResponse,
      message: aiResponse,
      analysis,
      metadata: {
        progress: {
          emotionalState: analysis?.emotionalState,
          riskLevel: analysis?.riskLevel,
        },
      },
    });
  } catch (error) {
    logger.error("Error in sendMessage:", error);
    res.status(500).json({
      message: "Error processing message",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get chat session history
export const getSessionHistory = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = new Types.ObjectId(req.user.id);

    const session = (await ChatSession.findById(
      sessionId
    ).exec()) as IChatSession;
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    if (session.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    res.json({
      messages: session.messages,
      startTime: session.startTime,
      status: session.status,
    });
  } catch (error) {
    logger.error("Error fetching session history:", error);
    res.status(500).json({ message: "Error fetching session history" });
  }
};

export const getChatSession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    logger.info(`Getting chat session: ${sessionId}`);
    const chatSession = await ChatSession.findOne({ sessionId });
    if (!chatSession) {
      logger.warn(`Chat session not found: ${sessionId}`);
      return res.status(404).json({ error: "Chat session not found" });
    }
    logger.info(`Found chat session: ${sessionId}`);
    res.json(chatSession);
  } catch (error) {
    logger.error("Failed to get chat session:", error);
    res.status(500).json({ error: "Failed to get chat session" });
  }
};

export const getChatHistory = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = new Types.ObjectId(req.user.id);

    // Find session by sessionId instead of _id
    const session = await ChatSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    if (session.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    res.json(session.messages);
  } catch (error) {
    logger.error("Error fetching chat history:", error);
    res.status(500).json({ message: "Error fetching chat history" });
  }
};

// Get all chat sessions for a user
export const getAllSessions = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user.id);
    const sessions = await ChatSession.find({ userId }).sort({ updatedAt: -1 });

    res.json(sessions);
  } catch (error) {
    logger.error("Error fetching all chat sessions:", error);
    res.status(500).json({ message: "Error fetching all chat sessions" });
  }
};

// Delete a chat session
export const deleteSession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = new Types.ObjectId(req.user.id);

    const session = await ChatSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    if (session.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    await ChatSession.deleteOne({ sessionId });
    logger.info(`Deleted chat session: ${sessionId}`);
    res.json({ message: "Session deleted successfully" });
  } catch (error) {
    logger.error("Error deleting chat session:", error);
    res.status(500).json({ message: "Error deleting chat session" });
  }
};
