const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

// Initialize Firebase Admin SDK
// When deployed to Cloud Functions, this auto-detects credentials
// The storageBucket must be set explicitly for the Storage emulator
admin.initializeApp({
    storageBucket: `${process.env.GCLOUD_PROJECT || "demo-no-project"}.appspot.com`,
});

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

module.exports = { admin, db, auth, storage, FieldValue };
