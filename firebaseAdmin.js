// const { initializeApp, cert } = require("firebase-admin/app");
// const { getAuth } = require("firebase-admin/auth");

// initializeApp({
//     credential: cert({
//         projectId: process.env.FIREBASE_PROJECT_ID,
//         clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
//         privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
//     }),
// });

// const auth = getAuth();

// module.exports = auth;

const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const serviceAccount = require("./serviceAccountKey.json");

// Initialize using the local credentials file directly
initializeApp({
    credential: cert(serviceAccount),
});

const auth = getAuth();

module.exports = auth;
