// Native env loading via --env-file flag used in launcher

const TARGET_BASE_URL = (
    process.env.REMINDER_TARGET_URL ||
    process.env.SITE_URL ||
    'http://localhost:3000'
).replace(/\/$/, '');

const CRON_SECRET = process.env.CRON_SECRET || process.env.REMINDER_CRON_SECRET;
const MAX_ATTEMPTS = Number(process.env.REMINDER_RETRY_ATTEMPTS || 3);
const RETRY_DELAY_MS = Number(process.env.REMINDER_RETRY_DELAY_MS || 5000);

if (!CRON_SECRET) {
    console.error('CRON_SECRET (or REMINDER_CRON_SECRET) is not defined in .env');
    process.exit(1);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLikelyLocalhost(url) {
    return /localhost|127\.0\.0\.1/i.test(url);
}

async function triggerOnce(url) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${CRON_SECRET}`,
            'Content-Type': 'application/json',
            'x-cron-secret': CRON_SECRET,
        },
    });

    const status = response.status;
    const text = await response.text();

    console.log(`Status: ${status}`);
    try {
        const result = JSON.parse(text);
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch {
        console.log('Raw Response:', text);
    }

    if (!response.ok) {
        throw new Error(`Reminder endpoint returned HTTP ${status}`);
    }
}

async function triggerReminders() {
    const url = `${TARGET_BASE_URL}/api/reminders/auto`;
    console.log(`Triggering auto reminders at ${url}...`);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
            await triggerOnce(url);
            return;
        } catch (error) {
            const causeCode = error && typeof error === 'object' && 'cause' in error
                ? error.cause && typeof error.cause === 'object' && 'code' in error.cause
                    ? String(error.cause.code)
                    : ''
                : '';
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${message}`);
            if (causeCode) {
                console.error(`Cause code: ${causeCode}`);
            }

            const text = `${String(error)} ${causeCode}`;
            if (attempt === MAX_ATTEMPTS) {
                if (text.includes('ECONNREFUSED') && isLikelyLocalhost(TARGET_BASE_URL)) {
                    console.error(
                        'Could not connect to localhost. Ensure the Next.js app is running, or set REMINDER_TARGET_URL/SITE_URL to your live domain.'
                    );
                }
                process.exit(1);
            }

            await sleep(RETRY_DELAY_MS);
        }
    }
}

triggerReminders();
