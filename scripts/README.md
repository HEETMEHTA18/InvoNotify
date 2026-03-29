# Scripts Guide

This folder contains operational scripts grouped by purpose.

## automation
- `run-reminders.bat`: Windows Task Scheduler launcher for reminder cron.
- `run-reminders.js`: Calls `/api/reminders/auto` with retry and secret auth.

## maintenance
- `check-db.ts`: Multi-tenancy and orphaned-record audit checks.
- `clear-db.ts`: Clears core tables (destructive; local/dev use only).

## integration
- `sarvam-voice.js`: Voice/TTS integration utility.
- `sarvam-vision.js`: Document intelligence integration utility.

## npm Commands
- `npm run check-db`
- `npm run db:clear`
- `npm run reminders:run`
- `npm run integration:sarvam:voice`
- `npm run integration:sarvam:vision`
