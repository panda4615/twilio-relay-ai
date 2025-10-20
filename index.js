import express from "express";
import bodyParser from "body-parser";
import { WebSocketServer } from "ws";
import twilio from "twilio";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Twilio webhook
app.post("/inbound", async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const connect = twiml.connect();
  connect.stream({ url: `wss://${process.env.DOMAIN}/twilio-bridge` });

  res.type("text/xml");
  res.send(twiml.toString());
});

// WebSocket bridge: Twilio <-> ElevenLabs
const server = app.listen(process.env.PORT || 3000, () => {
  console.log("Relay running on port", process.env.PORT || 3000);
});

const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/twilio-bridge") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      const eleven = new WebSocket(
        "wss://api.elevenlabs.io/v1/realtime?model_id=eleven_monolingual_v1",
        { headers: { "xi-api-key": process.env.ELEVEN_API_KEY } }
      );

      ws.on("message", (msg) => eleven.send(msg));
      eleven.on("message", (data) => ws.send(data));
      eleven.on("close", () => ws.close());
      ws.on("close", () => eleven.close());
    });
  }
});
