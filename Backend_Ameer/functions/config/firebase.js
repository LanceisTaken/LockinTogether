const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

// Initialize Firebase Admin SDK
// When deployed to Cloud Functions, this auto-detects credentials
admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

module.exports = { admin, db, auth, storage, FieldValue };
