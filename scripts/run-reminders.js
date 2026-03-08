// Native env loading via --env-file flag used in launcher

const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET || process.env.REMINDER_CRON_SECRET;

if (!CRON_SECRET) {
    console.error('CRON_SECRET (or REMINDER_CRON_SECRET) is not defined in .env');
    process.exit(1);
}

async function triggerReminders() {
    const url = `${SITE_URL.replace(/\/$/, '')}/api/reminders/auto`;
    console.log(`Triggering auto reminders at ${url}...`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CRON_SECRET}`,
                'Content-Type': 'application/json',
                'x-cron-secret': CRON_SECRET // Supporting both header formats
            },
        });

        const status = response.status;
        const text = await response.text();

        console.log(`Status: ${status}`);
        try {
            const result = JSON.parse(text);
            console.log('Result:', JSON.stringify(result, null, 2));
        } catch (e) {
            console.log('Raw Response:', text);
        }

        if (!response.ok) {
            process.exit(1);
        }
    } catch (error) {
        console.error('Error triggering reminders:', error);
        process.exit(1);
    }
}

triggerReminders();
