// ╔══════════════════════════════════════════════╗
// ║  FIREBASE CONFIG                            ║
// ╚══════════════════════════════════════════════╝

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyCxjSk7f-BR3EhqlonS5_u-iqf_ccZyVEc",
  authDomain:        "tippy10-e7c84.firebaseapp.com",
  databaseURL:       "https://tippy10-e7c84-default-rtdb.firebaseio.com",
  projectId:         "tippy10-e7c84",
  storageBucket:     "tippy10-e7c84.firebasestorage.app",
  messagingSenderId: "1018569597008",
  appId:             "1:1018569597008:web:846828594bd9f08ae67155",
};

const app = initializeApp(firebaseConfig);
export const db   = getDatabase(app);
export const auth = getAuth(app);

// ── Anonymous sign-in ──
// The Realtime Database rules require auth != null. We sign in anonymously
// on page load so the rest of the app can talk to the DB without the user
// noticing. Any code that hits the DB before user interaction MUST await
// `authReady` first.
export const authReady = new Promise((resolve) => {
  // onAuthStateChanged fires with the current user once auth is initialized
  // (either from a cached session or after signInAnonymously completes).
  const unsub = onAuthStateChanged(auth, user => {
    if (user) {
      unsub();
      resolve(user);
    }
  });
  // Kick off sign-in. If a cached session already exists, onAuthStateChanged
  // will resolve first and this becomes a no-op.
  signInAnonymously(auth).catch(err => {
    console.error('[Tippy10] Anonymous sign-in failed:', err);
    // Resolve anyway so the lobby UI doesn't hang. Subsequent DB calls will
    // fail with a permission error the user can see in the console.
    resolve(null);
  });
});
