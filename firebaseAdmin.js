const { initializeApp, cert } = require("firebase-admin/app");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({
    credential: cert(serviceAccount),
});

