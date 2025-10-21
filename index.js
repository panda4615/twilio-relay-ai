// index.js
import express from "express";
import { WebSocketServer } from "ws";
import bodyParser from "body-parser";
import twilio from "twilio";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Twilio webhook for incoming calls
app.post("/inbound", async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  // Initial greeting before ElevenLabs connects
  twiml.say(
    { voice: "Polly.Matthew" },
    "Welcome to Elite Car Service. Connecting you to our virtual assistant now."
  );

  // Connect to our Render relay websocket
  twiml.connect().stream({
    url: "wss://twilio-relay-ai.onrender.com/relay"
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

// Create HTTP server (Twilio hits this endpoint)
const server = app.listen(process.env.PORT || 3000, () => {
  console.log(`✅ Twilio relay running on port ${process.env.PORT || 3000}`);
});

// Create WebSocket relay bridge between Twilio ↔ ElevenLabs
const wss = new WebSocketServer({ server, path: "/relay" });

wss.on("connection", (twilioSocket) => {
  console.log("🔗 Twilio connected to WebSocket bridge");

  const elevenLabsSocket = new WebSocket(
    "wss://api.elevenlabs.io/v1/realtime/ws?model_id=eleven_multilingual_v2",
    {
      headers: {
        "xi-api-key": process.env.ELEVEN_API_KEY,
        "Accept": "audio/pcm"
      }
    }
  );

  elevenLabsSocket.on("open", () => {
    console.log("🎤 Connected to ElevenLabs Realtime");
  });

  elevenLabsSocket.on("message", (msg) => {
    // Forward ElevenLabs audio back to Twilio
    if (twilioSocket.readyState === 1) {
      twilioSocket.send(msg);
    }
  });

  twilioSocket.on("message", (msg) => {
    // Forward Twilio audio to ElevenLabs
    if (elevenLabsSocket.readyState === 1) {
      elevenLabsSocket.send(msg);
    }
  });

  twilioSocket.on("close", () => {
    console.log("❌ Twilio WebSocket closed");
    elevenLabsSocket.close();
  });

  elevenLabsSocket.on("close", () => {
    console.log("❌ ElevenLabs WebSocket closed");
    twilioSocket.close();
  });

  elevenLabsSocket.on("error", (err) => console.error("⚠️ ElevenLabs Error:", err));
  twilioSocket.on("error", (err) => console.error("⚠️ Twilio Error:", err));
});
