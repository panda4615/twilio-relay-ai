import express from "express";
import bodyParser from "body-parser";
import twilio from "twilio";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Twilio webhook endpoint
app.post("/inbound", async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  try {
    console.log("🔔 Incoming call received");

    const text = "Hola! Bienvenido a Elite Car Service. How can we help you today?";
    const voiceId = process.env.ELEVEN_VOICE_ID;
    const apiKey = process.env.ELEVEN_API_KEY;

    const elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text: text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.7
        }
      })
    });

    if (!elevenRes.ok) {
      const errText = await elevenRes.text();
      console.error("🚨 ElevenLabs TTS failed:", errText);
      twiml.say("Something went wrong generating the audio.");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    const audioBuffer = await elevenRes.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    // Twilio needs a public URL, so we use <Play> with base64 MP3 embedded as data URI
    twiml.play(`data:audio/mp3;base64,${audioBase64}`);
    console.log("✅ Audio generated and returned to Twilio");

  } catch (error) {
    console.error("🔥 Error in /inbound:", error);
    const twimlError = new twilio.twiml.VoiceResponse();
    twimlError.say("An internal application error occurred.");
    res.type("text/xml");
    return res.send(twimlError.toString());
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
