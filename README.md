# KidQuest

Adventure Quest Kids is a dependency-free PWA learning game for short parent-led sessions.

## What Is Included

- Real parent authentication through Firebase Auth
- Email/password parent sign-up and sign-in
- Google parent sign-in
- Firestore database storage for parent accounts, child profiles, settings, and progress
- Cross-device sync for signed-in parents
- Creator/admin role detection for `josephstar48@hotmail.com`
- Parent-facing Privacy Policy and Terms screens
- Firebase App Check integration hook for reCAPTCHA v3
- Parent account flow with real email/password and Google sign-in
- Child profiles with real names, avatar selection, difficulty, and chosen rewards
- World map with Forest, Mountains, City, and Space missions
- 3 to 5 challenge mission loop with math, reading, speed, logic, and fitness activities
- Coins, XP, levels, streaks, badges, titles, unlocks, and reward screen
- Parent dashboard for progress, profile management, assignments, and PWA status
- Semi-AI generator for free template-powered question sets by grade, topic, skill, and count
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
7. Add your deployed Vercel domain to Firebase Authentication authorized domains.

Do not hard-code production passwords in the app. Create or reset the creator/admin password from Firebase Authentication.

## App Check Setup

App Check is scaffolded in `app.js` and configured from `firebase-config.js`.

1. In Firebase Console, go to App Check.
2. Register the KidQuest web app.
3. Choose reCAPTCHA v3 for the first production setup.
4. Create or select a reCAPTCHA v3 site key for:
   - `localhost`
   - `127.0.0.1`
   - your Vercel production domain
   - any custom production domain
5. Paste the public site key into:

```js
window.KIDQUEST_APP_CHECK_SITE_KEY = "YOUR_RECAPTCHA_V3_SITE_KEY";
```

6. Test sign-up, Google sign-in, child profile creation, and mission progress.
7. In Firebase App Check, monitor requests first.
8. Enable enforcement for Cloud Firestore after you confirm legitimate traffic is passing.

Firebase recommends using App Check to help verify that requests originate from your app. For new integrations, Firebase also recommends considering reCAPTCHA Enterprise when you are ready for a stronger production setup.

## Restrict Firebase API Key

Firebase API keys are safe to include in web code for Firebase services, but they should still be restricted.

1. Open Google Cloud Console.
2. Select the KidQuest Firebase/Google Cloud project.
3. Go to APIs & Services > Credentials.
4. Click the browser API key used in `firebase-config.js`.
5. Under Application restrictions, choose HTTP referrers.
6. Add allowed referrers:

```text
http://127.0.0.1:5173/*
http://localhost:5173/*
https://YOUR-VERCEL-PROJECT.vercel.app/*
https://YOUR-CUSTOM-DOMAIN/*
```

7. Under API restrictions, choose Restrict key.
8. Keep only the APIs needed by Firebase Web Auth and Firestore for this project.
9. Save the key restrictions.

If sign-in or Firestore stops working after restriction, return to the key and add the missing Firebase-related API shown in the browser console or Google Cloud error.

## Future Backend Upgrade

The current Semi-AI questions are generated offline in the browser with templates and variation logic. To use hosted AI-generated questions later, add a server endpoint that calls your AI provider and keeps API keys off the client.
