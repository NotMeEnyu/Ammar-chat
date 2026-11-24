# AMMAR CHAT

Yellow/neon-green real-time social messaging app for web and Android (Capacitor).

## Included
- Firebase email/password registration and login
- User profiles and avatar uploads
- Private one-to-one chat
- Public and private groups
- Real-time Firestore messages and chat history
- Realtime Database online/offline presence
- Owner moderation endpoint for global ban/unban and group kick
- Firestore and Storage security rules

## 1. Requirements
- Node.js 20 or newer
- A Firebase project
- For Android builds: Android Studio and Android SDK

## 2. Create Firebase project
In Firebase Console:
1. Create a project and register a Web app.
2. Enable Authentication > Sign-in method > Email/Password.
3. Create Firestore Database.
4. Create Realtime Database.
5. Enable Storage.
6. Copy the Firebase web config into `src/firebase.js`.
7. Set up Firebase CLI: `npm install -g firebase-tools`, then `firebase login` and `firebase use --add`.

Deploy rules:
```bash
firebase deploy --only firestore:rules,database,storage
```

## 3. Configure owner account
Edit `OWNER_EMAIL` in `src/App.jsx` and set it to the email address you will use as the app owner.
In `functions/index.js`, the owner check uses the `OWNER_EMAIL` secret OR an existing user document with role `owner`.
Set the secret:
```bash
firebase functions:secrets:set OWNER_EMAIL
```
Enter your exact owner email when prompted.

Important: after creating your owner account, verify its Firestore `users/{uid}` document has `role: "owner"` using Firebase Console. Do this manually from the trusted project owner account. Do not let ordinary clients edit their own role. For stronger production provisioning, create the owner document using a one-time Admin SDK script or a trusted admin console.

Deploy the admin endpoint:
```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```
After deploy, set the URL in `adminAction` in `src/App.jsx` if your deployment URL is not `/api/adminAction`. Replace:
```js
fetch('/api/adminAction', {
```
with your deployed HTTPS function URL, for example:
```js
fetch('https://REGION-PROJECT_ID.cloudfunctions.net/adminAction', {
```
Use the exact URL shown by Firebase after deployment.

## 4. Run the website
From the project root:
```bash
npm install
npm run dev
```
Open the local URL Vite prints. For production:
```bash
npm run build
```
Deploy the `dist` directory to Firebase Hosting or another static host. Configure SPA rewrites to `/index.html`.

## 5. Build Android APK
```bash
npm install
npm run build
npx cap add android
npx cap sync android
npx cap open android
```
In Android Studio choose Build > Build Bundle(s) / APK(s) > Build APK(s).
For later web changes, run `npm run android:sync` and rebuild in Android Studio.

## Security notes before launch
- Keep Firebase Admin SDK credentials and secrets out of the client.
- Review and test rules in the Firebase Emulator Suite before launch.
- The owner role must be assigned only through a trusted admin process. Never grant roles from public signup.
- This starter includes basic text chat and moderation; add abuse reporting, rate limits, block lists, age-appropriate safeguards, notification delivery, and privacy/terms pages before public release.
- Firestore group membership and message rules should be tested against your exact Firebase project and app flows before launch.
- Online status is best-effort presence using Realtime Database; mobile backgrounding and network loss can delay status changes.
- Do not put real user data into a test deployment.
