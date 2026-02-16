import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhone = process.env.TWILIO_PHONE_NUMBER;

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

export async function sendSMS(to: string, message: string) {
    if (!client || !fromPhone) {
        console.log("Twilio credentials not configured. Skipping SMS.");
        console.log(`To: ${to}`);
        console.log(`Message: ${message}`);
        return;
    }

    try {
        const response = await client.messages.create({
            body: message,
            from: fromPhone,
            to: to,
        });
        console.log("SMS sent successfully:", response.sid);
        return response;
    } catch (error) {
        console.error("Failed to send SMS:", error);
        throw error;
    }
}
