import express from "express";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import twilio from "twilio";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Static folder to serve audio files
app.use("/audio", express.static("/tmp"));

// Root endpoint
app.get("/", (req, res) => {
  res.send("✅ Twilio Relay + ElevenLabs server is running");
});

// Twilio webhook for incoming calls
app.post("/inbound", (req, res) => {
  console.log("🔔 Incoming call received");

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(
    "Hola, bienvenido a Elite Car Service. How can we help you today?"
  );

  twiml.gather({
    input: "speech",
    action: "/process_input",
    method: "POST",
    speechTimeout: "auto",
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

// Process speech input from user and reply
app.post("/process_input", async (req, res) => {
  const speech = req.body.SpeechResult || "nothing detected";
  console.log("🎧 User said:", speech);

  // simple response logic (you can expand this later with AI)
  const reply = `Thanks for your message. You said, ${speech}. Our driver service is available 24 7. Would you like to schedule a ride?`;

  try {
    // generate ElevenLabs TTS
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVEN_VOICE_ID}?model_id=eleven_multilingual_v2`,
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVEN_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: reply,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.7 },
        }),
      }
    );

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      console.error("🚨 ElevenLabs TTS failed:", errText);
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say("Something went wrong generating the audio reply.");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());
    const filename = `reply_${Date.now()}.mp3`;
    const filePath = path.join("/tmp", filename);
    fs.writeFileSync(filePath, audioBuffer);
    const fileUrl = `${req.protocol}://${req.get("host")}/audio/${filename}`;

    console.log("✅ Audio generated and hosted at:", fileUrl);

    const twiml = new twilio.twiml.VoiceResponse();
    twiml.play(fileUrl);
    twiml.say("Goodbye.");
    res.type("text/xml");
    res.send(twiml.toString());
  } catch (error) {
    console.error("🔥 Error generating reply:", error);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("We had a problem processing your message.");
    res.type("text/xml");
    res.send(twiml.toString());
  }
});

// start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
