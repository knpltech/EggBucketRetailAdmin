// auth.js
import { auth, db } from './firebase';
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

export async function registerUser(email, password, role, userData) {
  try {
    // Create user with email/password
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Set custom claims based on role
    await setCustomClaims(user.uid, role);
    
    // Add user details to Firestore
    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, {
      email: email,
      role: role,
      ...userData,
      createdAt: new Date()
    });
    
    return user;
  } catch (error) {
    console.error("Registration error:", error);
    throw error;
  }
}

async function setCustomClaims(uid, role) {
  const idToken = await auth.currentUser.getIdToken(true);
  const response = await fetch('https://us-central1-eggbucket-retail.cloudfunctions.net/setCustomClaims', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({ uid, role })
  });
  
  if (!response.ok) {
    throw new Error('Failed to set custom claims');
  }
}