import React, { createContext, useEffect, useState } from "react";
// Import auth and db directly from your firebase.js file
// This is the crucial change to prevent duplicate initialization
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

export const AuthContext = createContext();

export const AuthContextProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null); // Initialize with null for clarity
  const [userId, setUserId] = useState(null); // State for current user's UID
  const [loading, setLoading] = useState(true); // State to indicate Firebase loading

  useEffect(() => {
    // --- IMPORTANT FIX: Removed all Firebase initialization calls from here ---
    // The 'auth' and 'db' instances are now imported directly from '../firebase'.
    // This prevents the "Firebase App named '[DEFAULT]' already exists" error.

    // Listen for auth state changes using the imported 'auth' instance
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setUserId(user.uid);
        console.log("AuthContext: User authenticated:", user.uid);
      } else {
        // If no user, you might still want to handle anonymous sign-in or other unauthenticated states.
        // For this demo, we'll just set to null if no user.
        // If you need anonymous sign-in, ensure your 'firebase.js' handles it
        // or you explicitly import and call signInAnonymously here,
        // potentially using __initial_auth_token if available in your environment.
        setCurrentUser(null);
        setUserId(null);
        console.log("AuthContext: No user authenticated.");
      }
      setLoading(false); // Set loading to false once auth state is determined
    });

    return () => {
      unsub(); // Cleanup the auth state listener
    };
  }, []); // Empty dependency array as 'auth' is a stable import

  return (
    // Provide currentUser, db, auth, userId, and loading state
    <AuthContext.Provider value={{ currentUser, db, auth, userId, loading }}>
      {!loading && children} {/* Render children only after Firebase is loaded */}
    </AuthContext.Provider>
  );
};