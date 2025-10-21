import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import twilio from "twilio";
import fs from "fs";
import path from "path";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const PORT = process.env.PORT || 3000;
const TMP_PATH = "/tmp"; // Render's writable temp folder

// === HANDLE INBOUND CALL ===
app.post("/inbound", async (req, res) => {
  console.log("🔔 Incoming call received");

  const twiml = new twilio.twiml.VoiceResponse();
  const text =
    "Hola! Bienvenido a Elite Car Service. How can we assist you today?";

  try {
    // === request audio from ElevenLabs ===
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
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.7 },
        }),
      }
    );

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      console.error("🚨 ElevenLabs TTS failed:", errText);
      twiml.say("Something went wrong generating the audio.");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    // === save MP3 to temporary file ===
    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());
    const filename = `voice_${Date.now()}.mp3`;
    const filePath = path.join(TMP_PATH, filename);
    fs.writeFileSync(filePath, audioBuffer);

    // === host the file publicly ===
    const fileUrl = `${req.protocol}://${req.get("host")}/audio/${filename}`;

    // === play the file ===
    twiml.play(fileUrl);
    console.log("✅ Audio generated and hosted at:", fileUrl);

    // === keep line open and listen ===
    twiml.gather({
      input: "speech dtmf",
      timeout: 10,
      numDigits: 1,
      action: "/process_input",
    });
    twiml.say("I'm listening. You can say something or press a number.");

    // === return TwiML ===
    res.type("text/xml");
    res.send(twiml.toString());
  } catch (error) {
    console.error("🔥 Error in /inbound:", error);
    const errTwiML = new twilio.twiml.VoiceResponse();
    errTwiML.say("An internal error occurred.");
    res.type("text/xml");
    res.send(errTwiML.toString());
  }
});

// === HANDLE INPUT ===
app.post("/process_input", (req, res) => {
  console.log("🎧 Input received from caller");
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say("Thanks! We received your input. Goodbye.");
  res.type("text/xml");
  res.send(twiml.toString());
});

// === SERVE AUDIO FILES ===
app.get("/audio/:file", (req, res) => {
  const filePath = path.join(TMP_PATH, req.params.file);
  if (fs.existsSync(filePath)) {
    res.setHeader("Content-Type", "audio/mpeg");
    res.sendFile(filePath);
  } else {
    res.status(404).send("File not found");
  }
});

app.listen(PORT, () =>
  console.log(`✅ Server running on port ${PORT}`)
);
