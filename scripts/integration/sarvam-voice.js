require("dotenv").config();
const { SarvamAIClient } = require("sarvamai");

const client = new SarvamAIClient({
    apiSubscriptionKey: process.env.SARVAM_API_KEY
});

async function main() {
    console.log("--- Sarvam AI Voice Reminder (Indian Accent) ---");
    
    // Example: Generate speech for a payment reminder
    try {
        const response = await client.textToSpeech.generate({
            text: "Hello, this is a friendly reminder from Shiv Hardware. Your invoice number INV-123 for two thousand rupees is due today. Please make the payment at your earliest convenience. Thank you!",
            voice: "hi-IN-Female-1", // High quality Indian female voice
            sampling_rate: 16000,
            enable_preprocessing: true,
            model: "bulbul:latest"
        });

        console.log("Speech generated successfully.");
        // In a real app, you would stream this to a call (Vapi/Twilio)
        // For now, we save it locally to verify the output
        const fs = require('fs');
        fs.writeFileSync('reminder-voice.wav', Buffer.from(response.audio_content, 'base64'));
        console.log("Saved to reminder-voice.wav");

    } catch (error) {
        console.error("Voice generation failed:", error);
    }
}

main();
