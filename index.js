import express from "express";
import bodyParser from "body-parser";
import WebSocket, { WebSocketServer } from "ws";
import twilio from "twilio";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Twilio inbound webhook
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

// handle websocket upgrades (Twilio <-> ElevenLabs)
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
  const elevenLabsSocket = new WebSocket(
    "wss://api.elevenlabs.io/v1/realtime?model=eleven_multilingual_v2",
    {
      headers: {
        "xi-api-key": process.env.ELEVEN_API_KEY,
        "Accept": "audio/pcm",
      },
    }
  );

  elevenLabsSocket.on("open", () => {
    console.log("🎤 Connected to ElevenLabs Realtime");
  });

  elevenLabsSocket.on("message", (msg) => {
    if (twilioSocket.readyState === WebSocket.OPEN) {
      twilioSocket.send(msg);
    }
  });

  elevenLabsSocket.on("close", () => {
    console.log("❌ ElevenLabs connection closed");
  });

  elevenLabsSocket.on("error", (err) => {
    console.error("⚠️ ElevenLabs error:", err.message);
  });

  twilioSocket.on("message", (msg) => {
    if (elevenLabsSocket.readyState === WebSocket.OPEN) {
      elevenLabsSocket.send(msg);
    }
  });

  twilioSocket.on("close", () => {
    console.log("❌ Twilio socket closed");
    elevenLabsSocket.close();
  });
});
