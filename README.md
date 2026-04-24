# KidQuest

Adventure Quest Kids is a dependency-free PWA learning game for short parent-led sessions.

## What Is Included

- Real parent authentication through Firebase Auth
- Email/password parent sign-up and sign-in
- Google parent sign-in
- Firestore database storage for parent accounts, child profiles, settings, and progress
- Cross-device sync for signed-in parents
- Creator/admin role detection for `josephstar48@hotmailcom`
- Parent account flow with real email/password and Google sign-in
- Child profiles with real names, avatar selection, difficulty, and chosen rewards
- World map with Forest, Mountains, City, and Space missions
- 3 to 5 challenge mission loop with math, reading, speed, logic, and fitness activities
- Coins, XP, levels, streaks, badges, titles, unlocks, and reward screen
- Parent dashboard for progress, profile management, assignments, and PWA status
- Multiplayer competition toggle for sibling/friend sessions
- Voice narration through the browser Speech Synthesis API
- Offline play through `sw.js`
- Local browser cache plus Firestore cloud sync
- Vercel-ready static deployment
- Downloadable full KidQuest PWA logo/icon at `assets/kidquest-icon.png`

## Local Preview

```bash
npm run dev
```

Then open:

```text
http://127.0.0.1:5173/
```

The app can also be opened directly from `index.html`, but the service worker and install behavior require a local server or deployed HTTPS origin.

## Deploy To Vercel

This project is static. Use the repository root as the Vercel project root and leave the build command empty.

## Firebase Setup

1. Create a Firebase project.
2. Enable Authentication providers:
   - Email/password
   - Google
3. Create a Cloud Firestore database.
4. Copy your Firebase web app config into `firebase-config.js`.
5. Publish the rules in `firestore.rules`.
6. Create the creator/admin user in Firebase Authentication using the creator email from `firebase-config.js`.

Do not hard-code production passwords in the app. Create or reset the creator/admin password from Firebase Authentication.

## Future Backend Upgrade

The current AI-style questions are generated offline in the browser. To use hosted AI-generated questions, add a server endpoint that calls your AI provider and keeps API keys off the client.
