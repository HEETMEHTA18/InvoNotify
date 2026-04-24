const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhone = process.env.TWILIO_PHONE_NUMBER;

function smsConfigured() {
    return Boolean(accountSid && authToken && fromPhone);
}

/**
 * Sends an SMS message.
 * This intentionally hard-fails when an SMS provider is not configured.
 */
export async function sendSMS(_to: string, _message: string) {
    void [_to, _message];

    if (!smsConfigured()) {
        const error = new Error("SMS provider is not configured");
        (error as Error & { code?: string }).code = "SMS_NOT_CONFIGURED";
        throw error;
    }

    // Twilio implementation intentionally disabled in this codebase.
    // Fail closed until a real provider integration is enabled.
    const error = new Error("SMS provider integration is not enabled");
    (error as Error & { code?: string }).code = "SMS_PROVIDER_DISABLED";
    throw error;
}
