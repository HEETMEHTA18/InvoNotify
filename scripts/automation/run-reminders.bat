@echo off
cd /d e:\Heet\B2B
node --env-file=.env scripts\automation\run-reminders.js >> logs\reminder-cron.log 2>&1
