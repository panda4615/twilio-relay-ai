import express from "express";
import bodyParser from "body-parser";
import twilio from "twilio";
import WebSocket, { WebSocketServer } from "ws";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Twilio Webhook
app.post("/inbound", async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const connect = twiml.connect();
  connect.stream({ url: `wss://${process.env.DOMAIN}/twilio-bridge` });
  res.type("text/xml");
  res.send(twiml.toString());
});

const server = app.listen(process.env.PORT || 3000, () => {
  console.log(`✅ Twilio relay running on port ${process.env.PORT || 3000}`);
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/twilio-bridge") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  }
});

wss.on("connection", async (twilioSocket) => {
  console.log("🔗 Twilio connected to WebSocket bridge");

  // connect to ElevenLabs realtime
const elevenLabsUrl = "wss://api.elevenlabs.io/v1/agents/stream?model=eleven_multilingual_v2";
  const elevenLabsSocket = new WebSocket(elevenLabsUrl, {
    headers: {
      "xi-api-key": process.env.ELEVEN_API_KEY,
      "Accept": "audio/pcm",
    },
  });

  elevenLabsSocket.onopen = () => {
    console.log("🎤 Connected to ElevenLabs Realtime API");
  };

  elevenLabsSocket.onerror = (error) => {
    console.error("🚨 ElevenLabs connection error:", error.message);
  };

  elevenLabsSocket.onclose = () => {
    console.log("❌ ElevenLabs WebSocket closed");
  };

  // Forward messages from Twilio → ElevenLabs
  twilioSocket.on("message", (msg) => {
    try {
      if (elevenLabsSocket.readyState === WebSocket.OPEN) {
        elevenLabsSocket.send(msg);
      }
    } catch (err) {
      console.error("⚠️ Error forwarding Twilio → ElevenLabs:", err.message);
    }
  });

  // Forward messages from ElevenLabs → Twilio
  elevenLabsSocket.onmessage = (event) => {
    try {
      if (twilioSocket.readyState === WebSocket.OPEN) {
        twilioSocket.send(event.data);
      }
    } catch (err) {
      console.error("⚠️ Error forwarding ElevenLabs → Twilio:", err.message);
    }
  };

  twilioSocket.on("close", () => {
    console.log("❌ Twilio socket closed");
    elevenLabsSocket.close();
  });
});

process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception:", err);
});
