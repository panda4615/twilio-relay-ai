import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import twilio from "twilio";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const PORT = process.env.PORT || 3000;

// Twilio Voice webhook — when someone calls your Twilio number
app.post("/inbound", async (req, res) => {
  console.log("🔔 Incoming call received");

  const twiml = new twilio.twiml.VoiceResponse();
  const messageText = "Hola! Bienvenido a Elite Car Service. How can we assist you today?";

  try {
    // generate TTS audio from ElevenLabs
    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVEN_VOICE_ID}?model_id=eleven_multilingual_v2`,
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVEN_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: messageText,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.7 }
        })
      }
    );

    if (!ttsResponse.ok) {
      const errBody = await ttsResponse.text();
      console.error("🚨 ElevenLabs TTS failed:", errBody);
      throw new Error(`TTS request failed with status ${ttsResponse.status}`);
    }

    // convert audio to base64 and store it in /tmp
    const audioBuffer = await ttsResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    // save Twilio XML response with the generated audio
    const audioUrl = `data:audio/mpeg;base64,${audioBase64}`;
    twiml.play(audioUrl);

    console.log("✅ Audio generated successfully");
    res.type("text/xml");
    res.send(twiml.toString());

  } catch (error) {
    console.error("🚨 TTS error:", error.message);
    const errorTwiml = new twilio.twiml.VoiceResponse();
    errorTwiml.say("Something went wrong generating the audio.");
    res.type("text/xml");
    res.send(errorTwiml.toString());
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
