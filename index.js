// index.js
import express from "express";
import bodyParser from "body-parser";
import { WebSocketServer, WebSocket } from "ws";
import twilio from "twilio";
import { Buffer } from "buffer";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// === 1. Twilio webhook ===
app.post("/inbound", async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say(
    { voice: "Polly.Matthew" },
    "Welcome to Elite Car Service. Please hold while we connect you to our AI receptionist."
  );

  const connect = twiml.connect();
  connect.stream({ url: "wss://twilio-relay-ai.onrender.com/relay" });

  res.type("text/xml");
  res.send(twiml.toString());
});

// === 2. start server ===
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`✅ Twilio relay running on port ${PORT}`);
});

// === 3. Twilio <-> ElevenLabs bridge ===
const wss = new WebSocketServer({ server, path: "/relay" });

wss.on("connection", (twilioSocket) => {
  console.log("🔗 Twilio connected to WebSocket bridge");

  const elevenLabsSocket = new WebSocket(
    "wss://api.elevenlabs.io/v1/realtime/ws?model_id=eleven_multilingual_v2",
    {
      headers: {
        "xi-api-key": process.env.ELEVEN_API_KEY,
        "Accept": "audio/pcm",
      },
    }
  );

  elevenLabsSocket.addEventListener("open", () => {
    console.log("🎤 Connected to ElevenLabs Realtime");

    // optional: greeting from AI voice
    const initMsg = JSON.stringify({
      type: "conversation_initiation",
      conversation: {
        text: "Hello, this is Elite Car Service. How can I assist you today?",
        voice: "Rachel",
      },
    });
    elevenLabsSocket.send(initMsg);
  });

  // === Twilio → ElevenLabs ===
  twilioSocket.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.event === "media" && data.media?.payload) {
        const audio = Buffer.from(data.media.payload, "base64");
        if (elevenLabsSocket.readyState === WebSocket.OPEN) {
          elevenLabsSocket.send(audio);
        }
      }
    } catch (err) {
      console.error("⚠️ Twilio message parse error:", err.message);
    }
  });

  // === ElevenLabs → Twilio ===
  elevenLabsSocket.addEventListener("message", (event) => {
    if (twilioSocket.readyState === WebSocket.OPEN) {
      twilioSocket.send(event.data);
    }
  });

  // === cleanup & errors ===
  twilioSocket.on("close", () => {
    console.log("❌ Twilio socket closed");
    elevenLabsSocket.close();
  });

  elevenLabsSocket.addEventListener("close", () => {
    console.log("🔇 ElevenLabs socket closed");
    twilioSocket.close();
  });

  elevenLabsSocket.addEventListener("error", (err) => {
    console.error("⚠️ ElevenLabs error:", err.message);
  });

  twilioSocket.on("error", (err) => {
    console.error("⚠️ Twilio error:", err.message);
  });
});
