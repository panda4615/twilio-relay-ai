import express from "express";
import bodyParser from "body-parser";
import { WebSocketServer } from "ws";
import twilio from "twilio";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// === Twilio webhook (handles incoming calls) ===
app.post("/inbound", async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  const connect = twiml.connect();
  connect.stream({
    url: `wss://${process.env.DOMAIN}/twilio-bridge`,
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`✅ Twilio relay running on port ${PORT}`);
});

// === WebSocket Twilio <-> ElevenLabs bridge ===
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/twilio-bridge") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      console.log("🔗 Twilio WebSocket connected");

      // connect to ElevenLabs Realtime API
      const elevenWs = new WebSocket(
        "wss://api.elevenlabs.io/v1/convai/ws",
        {
          headers: {
            "xi-api-key": process.env.ELEVEN_API_KEY,
          },
        }
      );

      elevenWs.on("open", () => {
        console.log("🎤 Connected to ElevenLabs Realtime Voice");
      });

      // incoming audio from Twilio -> send to ElevenLabs
      ws.on("message", (msg) => {
        if (elevenWs.readyState === WebSocket.OPEN) {
          elevenWs.send(msg);
        }
      });

      // ElevenLabs audio back to Twilio
      elevenWs.on("message", (audioData) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(audioData);
        }
      });

      // clean up
      ws.on("close", () => {
        console.log("❌ Twilio stream closed");
        elevenWs.close();
      });
      elevenWs.on("close", () => {
        console.log("🔇 ElevenLabs disconnected");
        ws.close();
      });
    });
  } else {
    socket.destroy();
  }
});
