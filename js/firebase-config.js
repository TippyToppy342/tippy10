// ╔══════════════════════════════════════════════╗
// ║  FIREBASE CONFIG                            ║
// ╚══════════════════════════════════════════════╝

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

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
export const db = getDatabase(app);
