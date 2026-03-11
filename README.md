# ChatSpoof: AI Support with Real-Time Human Escalation

**ChatSpoof** is a professional full-stack MERN application designed for intelligent customer support. It uses Google Gemini AI for automated assistance and features a real-time escalation system that alerts a human agent when the AI's confidence drops.



---

## 🚀 Key Features

* **AI Confidence Logic:** Unlike basic chatbots, this system evaluates Gemini's confidence score. If the score is below **0.5**, it automatically escalates the chat.
* **Real-Time Interaction:** Powered by **Socket.io**, messages appear instantly for both the user and the admin without page refreshes.
* **Persistent History:** All conversations are stored in **MongoDB**, allowing users to resume their chats even after refreshing the page.
* **Admin Dashboard:** A dedicated view for support agents to monitor all chats, view escalation statuses, and take over conversations.
* **Markdown Rendering:** High-quality formatting for code snippets, lists, and bold text within the chat bubbles.

---

## 🛠️ Tech Stack

* **Frontend:** React.js, Tailwind CSS, React Router, Socket.io-client
* **Backend:** Node.js, Express.js
* **Database:** MongoDB (via Mongoose)
* **AI Integration:** Google Generative AI (Gemini 2.5 Flash)

---

## 📋 Architecture Overview

### 1. The "Think Twice" Workflow
When a message is sent, the backend acts as a controller. It determines if the message should go to the AI or stay with a human agent based on the conversation's `status` in MongoDB.



### 2. WebSocket Rooms
To ensure privacy and performance, each `conversationId` is treated as a unique Socket.io **Room**. This prevents messages from "leaking" into other users' sessions.

### 3. Structured AI Output
We utilize **Prompt Engineering** to force Gemini to return a specific JSON schema. This allows our Node.js server to programmatically read the `confidence` score and the `answer` separately.

---

## ⚙️ Setup & Installation

### Prerequisites
* Node.js installed
* MongoDB running locally (port 27017)
* A Google Gemini API Key

### Backend Setup
1. Open your terminal in the server directory.
2. Install dependencies: `npm install`
3. Create a `.env` file:
   ```env
   PORT=8120
   MONGO_URI=mongodb://localhost:27017/chatspoof
   KEY=your_gemini_api_key
  
