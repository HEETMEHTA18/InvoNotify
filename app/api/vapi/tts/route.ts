/**
 * POST /api/vapi/tts
 *
 * Custom TTS proxy for VAPI.ai → Sarvam AI
 *
 * VAPI supports "custom-voice" providers. When configured, VAPI sends the
 * text to this endpoint and expects raw audio bytes back.
 *
 * VAPI sends:  { text: string, ... }
 * We forward:  text → Sarvam TTS API
 * We return:   raw WAV audio bytes (Content-Type: audio/wav)
 *
 * This way VAPI uses Sarvam's natural Indian voice instead of its default voices.
 * Docs: https://docs.vapi.ai/customization/custom-voice
 */
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: "SARVAM_API_KEY not configured" }, { status: 500 });
    }

    let text: string;
    try {
        const body = await req.json();
        text = body.text || body.message || "";
        if (!text) throw new Error("empty text");
    } catch {
        return NextResponse.json({ error: "text field is required" }, { status: 400 });
    }

    // Sarvam TTS has a 500-char limit per request — chunk if needed
    // For reminder calls, the script is usually under 500 chars so this is fine
    const truncatedText = text.slice(0, 500);

    const sarvamResponse = await fetch("https://api.sarvam.ai/text-to-speech", {
        method: "POST",
        headers: {
            "api-subscription-key": apiKey,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            inputs: [truncatedText],
            target_language_code: "en-IN",
            speaker: "meera",           // Calm, natural Indian English female voice
            pitch: 0,
            pace: 0.9,                  // Slightly slower for phone clarity
            loudness: 1.5,
            speech_sample_rate: 8000,   // 8kHz = standard telephone audio quality
            enable_preprocessing: true,
            model: "bulbul:v1",
        }),
    });

    if (!sarvamResponse.ok) {
        const error = await sarvamResponse.text();
        console.error("Sarvam TTS proxy error:", sarvamResponse.status, error);
        return NextResponse.json(
            { error: `Sarvam TTS error: ${sarvamResponse.status}` },
            { status: 502 }
        );
    }

    const data = await sarvamResponse.json();
    const base64Audio: string | undefined = data?.audios?.[0];

    if (!base64Audio) {
        return NextResponse.json({ error: "Sarvam returned no audio" }, { status: 502 });
    }

    // Decode base64 WAV and return as raw audio
    const audioBuffer = Buffer.from(base64Audio, "base64");

    return new NextResponse(audioBuffer, {
        headers: {
            "Content-Type": "audio/wav",
            "Content-Length": audioBuffer.length.toString(),
        },
    });
}
