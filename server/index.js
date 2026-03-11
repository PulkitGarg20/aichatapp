const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const http = require("http"); // Required for WebSockets
const { Server } = require("socket.io"); // Required for WebSockets
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors({
  origin: "*", 
  methods: ["GET", "POST"]
}));
app.use(express.json());

// ==========================================
// 1. SOCKET.IO SETUP (Real-time Messaging)
// ==========================================
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // This allows any frontend to connect
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'] // Helps with connection stability on Render
});

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);
  
  socket.on("join_room", (conversationId) => {
    socket.join(conversationId);
    console.log(`🏠 User ${socket.id} joined room: ${conversationId}`);
  });
});

// ==========================================
// 2. MONGODB DATABASE SETUP & SCHEMAS
// ==========================================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to Local MongoDB!"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Schema 1: Conversation
const conversationSchema = new mongoose.Schema({
  status: { type: String, enum: ['active', 'escalated', 'resolved'], default: 'active' },
  createdAt: { type: Date, default: Date.now }
});
const Conversation = mongoose.model("Conversation", conversationSchema);

// Schema 2: Message
const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: String, enum: ['user', 'ai', 'agent'], required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model("Message", messageSchema);

// ==========================================
// 3. GEMINI AI SETUP
// ==========================================
if (!process.env.KEY) {
  console.log("❌ Gemini API key not found in .env file");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  // Force Gemini to output JSON so we can extract the confidence score
  generationConfig: { responseMimeType: "application/json" } 
});

// ==========================================
// 4. REQUIRED API ENDPOINTS
// ==========================================

// Endpoint 1: Start a new conversation
app.post("/chat/start", async (req, res) => {
  try {
    const newConversation = new Conversation();
    await newConversation.save();
    res.json({ success: true, conversation: newConversation });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error starting chat" });
  }
});

// Endpoint 2: Fetch chat history
app.get("/chat/:id", async (req, res) => {
  try {
    const messages = await Message.find({ conversationId: req.params.id }).sort('timestamp');
    const conversation = await Conversation.findById(req.params.id);
    res.json({ success: true, conversation, messages });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching history" });
  }
});

// Helper Endpoint: Fetch all conversations for the Admin Panel
app.get("/admin/conversations", async (req, res) => {
  try {
    const conversations = await Conversation.find().sort({ createdAt: -1 });
    res.json({ success: true, conversations });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching conversations" });
  }
});

// Endpoint 3: Send a message & Handle AI Confidence Logic
app.post("/chat/message", async (req, res) => {
  try {
    const { conversationId, message, sender } = req.body;

    if (!conversationId || !message || !sender) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const conv = await Conversation.findById(conversationId);
    if (!conv) return res.status(404).json({ success: false, message: "Chat not found" });

    // 1. Save the incoming message to MongoDB
    const newMsg = new Message({ conversationId, sender, message });
    await newMsg.save();
    
    // 2. Broadcast message instantly via WebSockets
    io.to(conversationId).emit("receive_message", newMsg);

    // 3. Skip AI if a human agent sent the message or if the chat is already escalated
    if (sender === "agent" || conv.status === "escalated") {
      return res.json({ success: true, message: newMsg });
    }

    // 4. Trigger AI & Confidence Check
    const prompt = `
      You are a helpful customer support AI. The user says: "${message}".
      Respond to the user. Also, provide a confidence score between 0.0 and 1.0. 
      If you do not know the answer, are confused, or lack context, provide a score below 0.5.
      Output strictly in this JSON format: {"answer": "your response", "confidence": 0.9}
    `;

    const result = await model.generateContent(prompt);
    const aiData = JSON.parse(result.response.text());
    let finalAiText = aiData.answer;

    // 5. Evaluate Confidence Check
    if (aiData.confidence < 0.5) {
      conv.status = "escalated";
      await conv.save();
      finalAiText = "I'm not completely sure how to help with that. I am transferring this chat to a human agent who will be with you shortly.";
      
      // Notify the frontend that this chat needs an admin
      io.emit("chat_escalated", conv); 
    }

    // 6. Save and broadcast the AI's reply
    const aiMsg = new Message({ conversationId, sender: "ai", message: finalAiText });
    await aiMsg.save();
    io.to(conversationId).emit("receive_message", aiMsg);

    res.json({ success: true, message: aiMsg });

  } catch (error) {
    console.error("❌ Message Error:", error);
    res.status(500).json({ success: false, message: "Server error processing message" });
  }
});

const PORT = process.env.PORT || 8120;
// NOTICE: Using server.listen() instead of app.listen() for WebSockets
server.listen(PORT, () => {
  console.log(`🚀 Server & WebSockets running on port ${PORT}`);
});
