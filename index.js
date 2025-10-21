import express from "express";
import bodyParser from "body-parser";
import twilio from "twilio";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Twilio credentials (auto from Render env)
const VoiceResponse = twilio.twiml.VoiceResponse;

// POST endpoint Twilio hits when call starts
app.post("/inbound", async (req, res) => {
  const twiml = new VoiceResponse();

  // Simple voice greeting logic (customize this however you want)
  const prompt = "Hello! Thanks for calling Elite Car Service. How can I assist you today?";

  try {
    // call ElevenLabs TTS REST API (works on Creator plan)
    const elevenRes = await fetch("https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL", {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVEN_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: prompt,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.8 }
      })
    });

    const audioBuffer = await elevenRes.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString("base64");

    // tell Twilio to play the response
    const play = twiml.play();
    play.audio(`data:audio/mp3;base64,${base64Audio}`);

    res.type("text/xml");
    res.send(twiml.toString());
  } catch (err) {
    console.error("TTS error:", err);
    twiml.say("Sorry, something went wrong. Please try again later.");
    res.type("text/xml");
    res.send(twiml.toString());
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
