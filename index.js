import express from "express";
import bodyParser from "body-parser";
import { WebSocketServer } from "ws";
import twilio from "twilio";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Twilio webhook endpoint
app.post("/inbound", async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const connect = twiml.connect();
  connect.stream({
    url: `wss://${process.env.DOMAIN}/twilio-bridge`,
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

// Start HTTP server for Render
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`✅ Twilio relay running on port ${PORT}`);
});

// WebSocket relay between Twilio <-> ElevenLabs
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/twilio-bridge") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      console.log("🔗 Twilio connected to WebSocket bridge");
      ws.on("message", (msg) => {
        // TODO: Forward to ElevenLabs stream later
      });
      ws.on("close", () => console.log("❌ Twilio WebSocket closed"));
    });
  } else {
    socket.destroy();
  }
});
