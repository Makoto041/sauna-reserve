/**
 * SelectType Reservation Availability Monitor
 *
 * Firebase Cloud Functions v2 that monitors a SelectType reservation page
 * for availability and sends LINE notifications.
 */

import { initializeApp } from "firebase-admin/app";

// Initialize Firebase Admin
initializeApp();

// Export functions
export { lineWebhook, watchScheduler } from "./handlers/index.js";
