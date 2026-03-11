import { useState, useEffect, useRef } from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { FaUserCircle, FaUserShield } from "react-icons/fa";
import ReactMarkdown from "react-markdown";
import io from "socket.io-client";
import "./App.css";

// Connect to our backend WebSockets
const API_BASE = "https://aichatapp-backend-zw36.onrender.com";
const socket = io(API_BASE);


function ChatInterface() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // Check if user already has a chat session, otherwise start a new one
    const initChat = async () => {
      let currentConvId = localStorage.getItem("chatSpoofConvId");

      if (currentConvId) {
        try {
          const response = await fetch(`${API_BASE}/chat/${currentConvId}`);
          const data = await response.json();
          if (data.success) {
            setMessages(data.messages);
            setConversationId(currentConvId);
            socket.emit("join_room", currentConvId); // Join real-time room
          }
        } catch (error) { console.error(error); }
      } else {
        try {
          const response = await fetch(`${API_BASE}/chat/start`, { method: "POST" });
          const data = await response.json();
          if (data.success) {
            const newId = data.conversation._id;
            localStorage.setItem("chatSpoofConvId", newId);
            setConversationId(newId);
            socket.emit("join_room", newId);
          }
        } catch (error) { console.error(error); }
      }
    };

    initChat();

    // Listen for incoming real-time messages (from AI or Admin)
    socket.on("receive_message", (newMsg) => {
      setMessages((prev) => {
        if (prev.find((m) => m._id === newMsg._id)) return prev;
        return [...prev, newMsg];
      });
      
      // ONLY stop loading if the AI or Human Agent replies!
      if (newMsg.sender !== "user") {
        setLoading(false);
      }
    });

    return () => socket.off("receive_message");
  }, []);

  const handleSendMessage = async () => {
    if (!input.trim() || !conversationId) return;

    // Save the text before we clear the input box
    const messageText = input; 
    setInput("");
    setLoading(true); // Turn on the "Typing..." indicator

    try {
     await fetch(`${API_BASE}/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId,
          message: messageText,
          sender: "user"
        })
      });
    } catch (error) {
      console.log(error);
      setLoading(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <>
      <header className="fixed top-0 left-0 w-full border-b border-gray-800 bg-[#0d0d0d] z-10">
        <div className="container mx-auto flex justify-between items-center px-6 py-4">
          <h1 className="text-lg font-bold text-white">ChatSpoof Support</h1>
          <Link to="/admin" className="text-gray-400 hover:text-white transition flex items-center gap-2">
            <FaUserShield /> Admin
          </Link>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pt-24 pb-24 flex flex-col bg-black min-h-screen">
        <div className="w-full max-w-4xl mx-auto px-4 flex flex-col space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-gray-400 text-lg mt-10">Hi, how can we help you today?</div>
          ) : (
            <>
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`px-4 py-3 rounded-xl max-w-[75%] ${
                    msg.sender === "user" ? "bg-blue-600 text-white self-end"
                    : msg.sender === "agent" ? "bg-green-700 text-white self-start border-2 border-green-500"
                    : "bg-gray-800 text-gray-100 self-start"
                  }`}
                >
                  <div className="text-xs opacity-50 mb-1 capitalize">{msg.sender === 'ai' ? 'AI Assistant' : msg.sender}</div>
                  {msg.sender === "user" ? msg.message : <div className="markdown-content"><ReactMarkdown>{msg.message}</ReactMarkdown></div>}
                </div>
              ))}
              {loading && <div className="bg-gray-700 text-gray-300 px-4 py-2 rounded-xl max-w-[60%] self-start animate-pulse">Typing...</div>}
              <div ref={messagesEndRef}></div>
            </>
          )}
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 w-full border-t border-gray-800 bg-[#0d0d0d]">
        <div className="max-w-4xl mx-auto flex justify-center px-4 py-3">
          <div className="w-full flex bg-gray-900 rounded-full px-4 py-2 shadow-lg">
            <input
              type="text"
              className="flex-1 bg-transparent outline-none text-white placeholder-gray-400 px-2"
              placeholder="Type your message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              disabled={loading}
            />
            <button onClick={handleSendMessage} className="bg-blue-600 hover:bg-blue-700 px-4 py-1 rounded-full text-white font-medium disabled:opacity-50" disabled={loading}>Send</button>
          </div>
        </div>
      </footer>
    </>
  );
}


function AdminPanel() {
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [adminInput, setAdminInput] = useState("");

  useEffect(() => {
    // Fetch all conversations for the sidebar
    const fetchConversations = async () => {
      try {
       const response = await fetch(`${API_BASE}/admin/conversations`);
        const data = await response.json();
        if (data.success) setConversations(data.conversations);
      } catch (error) { console.error(error); }
    };
    fetchConversations();

    // Listen for newly escalated chats to turn them red
    socket.on("chat_escalated", (updatedConv) => {
      setConversations((prev) => prev.map(c => c._id === updatedConv._id ? updatedConv : c));
    });

    socket.on("receive_message", (newMsg) => {
      setMessages((prev) => {
        if (prev.find((m) => m._id === newMsg._id)) return prev;
        return [...prev, newMsg];
      });
    });

    return () => {
      socket.off("chat_escalated");
      socket.off("receive_message");
    };
  }, []);

  const loadChat = async (convId) => {
    try {
      const response = await fetch(`${API_BASE}/chat/${convId}`);
      const data = await response.json();
      if (data.success) {
        setActiveChat(data.conversation);
        setMessages(data.messages);
        socket.emit("join_room", convId); 
      }
    } catch (error) { console.error(error); }
  };

  const handleAdminReply = async () => {
    if (!adminInput.trim() || !activeChat) return;

    const tempMessage = { _id: Date.now(), sender: "agent", message: adminInput };
    setMessages((prev) => [...prev, tempMessage]);
    setAdminInput("");

    try {
      await fetch(`${API_BASE}/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeChat._id,
          message: tempMessage.message,
          sender: "agent" 
        })
      });
    } catch (error) { console.error(error); }
  };

  return (
    <div className="flex h-screen bg-[#0d0d0d] text-white overflow-hidden">
      <div className="w-1/3 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center gap-2"><FaUserShield className="text-green-500" /> Admin</h2>
          <Link to="/" className="text-sm text-blue-400 hover:underline">Exit to User Chat</Link>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {conversations.map((conv) => (
            <div 
              key={conv._id} 
              onClick={() => loadChat(conv._id)}
              className={`p-3 rounded-lg cursor-pointer border ${activeChat?._id === conv._id ? 'bg-gray-800 border-gray-500' : 'bg-black border-gray-800 hover:bg-gray-800'}`}
            >
              <div className="text-sm text-gray-400">ID: {conv._id.substring(0,8)}...</div>
              <div className="flex justify-between mt-1 text-xs">
                <span>{new Date(conv.createdAt).toLocaleTimeString()}</span>
                <span className={`px-2 py-0.5 rounded-full ${conv.status === 'escalated' ? 'bg-red-900 text-red-300' : 'bg-green-900 text-green-300'}`}>
                  {conv.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="w-2/3 flex flex-col">
        {activeChat ? (
          <>
            <div className="p-4 border-b border-gray-800 bg-black flex justify-between items-center">
              <h3 className="font-bold">Chatting in {activeChat._id.substring(0,8)}...</h3>
              <span className="text-xs text-red-400 bg-red-900/30 px-3 py-1 rounded-full">
                {activeChat.status === 'escalated' ? 'Escalated to Human' : 'AI Handling'}
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-black">
              {messages.map((msg, idx) => (
                <div key={idx} className={`p-3 rounded-xl max-w-[80%] ${
                  msg.sender === "user" ? "bg-gray-800 text-gray-200 self-start" : 
                  msg.sender === "agent" ? "bg-green-700 text-white self-end ml-auto" : "bg-blue-900 text-blue-100 self-end ml-auto"
                }`}>
                  <div className="text-xs opacity-50 mb-1 capitalize">{msg.sender}</div>
                  <div className="markdown-content text-sm"><ReactMarkdown>{msg.message}</ReactMarkdown></div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-gray-800 bg-gray-900">
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 bg-black border border-gray-700 rounded-lg px-4 py-2 text-white outline-none focus:border-green-500"
                  placeholder="Type a reply as an agent..."
                  value={adminInput}
                  onChange={(e) => setAdminInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdminReply()}
                />
                <button onClick={handleAdminReply} className="bg-green-600 hover:bg-green-500 px-6 py-2 rounded-lg font-bold">Reply</button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 bg-black">Select a conversation from the left to view history and respond.</div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<ChatInterface />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
    </Router>
  );
}
