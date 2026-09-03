# InvoNotify — Video Recording Guide

## Quick Start (30 minutes to final video)

### Step 1: Prepare (5 min)
```bash
# Reset demo data
npx tsx scripts/ai/seed-recovery-data.ts

# Start dev server
pnpm dev
```

### Step 2: Record Screens (15 min)
Open http://localhost:3000 and record each page in order:

| Order | Page | Duration | Focus |
|-------|------|----------|-------|
| 1 | `/dashboard` | 30s | Hero metrics, overview |
| 2 | `/dashboard/invoices` | 20s | 9 overdue invoices |
| 3 | `/dashboard/diagnosis` | 30s | Risk distribution, pipeline |
| 4 | `/dashboard/credit-scores` | 25s | CIBIL meters, customer table |
| 5 | `/dashboard/recovery` | 30s | Cases, risk scores, actions |
| 6 | `/dashboard/whatsapp` | 20s | Config status, features |
| 7 | `/dashboard/promises` | 20s | Promise tracking |
| 8 | `/dashboard/recovery/analytics` | 25s | Funnel, baseline comparison |
| 9 | `/dashboard/invoices/create` | 20s | Form, submit, redirect |
| 10 | `/invoice/{id}` | 20s | Pay button, Razorpay |
| 11 | Gmail inbox | 15s | Received email |
| 12 | Razorpay checkout | 15s | Payment flow |

### Step 3: Generate Voiceover (5 min)
1. Go to https://elevenlabs.io
2. Paste voiceover script from `DEMO_SCRIPT.md` (bottom section)
3. Generate audio → Download MP3

### Step 4: Edit Video (10 min)
1. Go to https://www.descript.com
2. Import screen recordings + voiceover
3. Auto-sync, remove silences, add captions
4. Export as MP4

---

## Full AI Pipeline (No Manual Recording)

### Option A: Pictory.ai
1. Sign up at https://pictory.ai
2. Paste the voiceover script
3. Upload screenshots of each page
4. AI generates video with transitions
5. Export as MP4

### Option B: InVideo AI
1. Go to https://invideo.io
2. Describe: "Hackathon demo video for AI invoice recovery platform"
3. Upload screenshots
4. AI adds stock footage, music, transitions
5. Export as MP4

### Option C: Runway ML
1. Go to https://runwayml.com
2. Upload screenshots
3. Use AI to generate smooth transitions
4. Add voiceover track
5. Export as MP4

---

## Video Specifications

| Property | Value |
|----------|-------|
| Resolution | 1920x1080 (Full HD) |
| FPS | 30 |
| Duration | 3:00 - 4:00 minutes |
| Format | MP4 (H.264) |
| Audio | AAC, 48kHz |

---

## Upload Locations

1. **YouTube** — Unlisted link for judges
2. **Devpost** — Add to submission
3. **GitHub README** — Add video embed
4. **Google Drive** — Share with organizers

---

## Tips

- Start with the problem, end with results
- Show numbers (recovery rate, amount recovered)
- Keep it under 4 minutes
- Add captions (many judges watch without sound)
- Test on mobile before submitting
