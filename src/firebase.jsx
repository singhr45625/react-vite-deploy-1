
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFirestore} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "chat-72022.firebaseapp.com",
  projectId: "chat-72022",
  storageBucket: "chat-72022.firebasestorage.app",
  messagingSenderId: "405724413451",
  appId: "1:405724413451:web:24392b1b3837020dac110e"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth();
export const storage = getStorage();
export const db = getFirestore();