import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';

export const app = initializeApp(window.VIAMINA_CONFIG.FIREBASE_CONFIG);
window.viaminaDatabase = getDatabase(app);
window.viaminaAuth = getAuth(app);