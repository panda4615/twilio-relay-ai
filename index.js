// index.js
import express from "express";
import bodyParser from "body-parser";
import { WebSocketServer, WebSocket } from "ws";
import twilio from "twilio";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// === Twilio webhook ===
app.post("/inbound", async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say(
    { voice: "Polly.Matthew" },
    "Welcome to Elite Car Service. Connecting you to our AI receptionist."
  );

  const connect = twiml.connect();
  connect.stream({ url: "wss://twilio-relay-ai.onrender.com/relay" });

  res.type("text/xml");
  res.send(twiml.toString());
});

// === Start Express server ===
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`✅ Twilio relay running on port ${PORT}`);
});

// === WebSocket relay ===
const wss = new WebSocketServer({ server, path: "/relay" });

wss.on("connection", (twilioSocket) => {
  console.log("🔗 Twilio connected to WebSocket bridge");

  // ✅ Create proper ElevenLabs WebSocket instance (Node 22 style)
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
  });

  elevenLabsSocket.addEventListener("message", (event) => {
    if (twilioSocket.readyState === WebSocket.OPEN) {
      twilioSocket.send(event.data);
    }
  });

  twilioSocket.on("message", (msg) => {
    if (elevenLabsSocket.readyState === WebSocket.OPEN) {
      elevenLabsSocket.send(msg);
    }
  });

  twilioSocket.on("close", () => {
    console.log("❌ Twilio WebSocket closed");
    elevenLabsSocket.close();
  });

  elevenLabsSocket.addEventListener("close", () => {
    console.log("❌ ElevenLabs WebSocket closed");
    twilioSocket.close();
  });

  elevenLabsSocket.addEventListener("error", (err) => {
    console.error("⚠️ ElevenLabs Error:", err.message);
  });

  twilioSocket.on("error", (err) => {
    console.error("⚠️ Twilio Error:", err.message);
  });
});
