// firebase.js
// Import Firebase modules
import firebase from "https://www.gstatic.com/firebasejs/10.7.0/firebase-compat.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyC_7uxANcO2d24cu1NhZXePjBTUUiQlg8w",
    authDomain: "eggbucket-retail.firebaseapp.com",
    projectId: "eggbucket-retail",
    storageBucket: "eggbucket-retail.appspot.com",
    messagingSenderId: "622280717027",
    appId: "1:622280717027:web:4aaa62dd8800f40914cbd6",
    measurementId: "G-GDWHZ5RQ55"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Get Auth and Firestore instances
const auth = firebase.auth();
const db = firebase.firestore();

// Make auth and db available globally
window.auth = auth;
window.db = db;

// Function to create a new user
async function createUser(email, password, role) {
    try {
        // Try to sign in first to check if user exists
        try {
            await auth.signInWithEmailAndPassword(email, password);
            console.log('User already exists');
        } catch (error) {
            // If user doesn't exist, create new user
            if (error.code === 'auth/user-not-found') {
                const userCredential = await auth.createUserWithEmailAndPassword(email, password);
                console.log('Created new user:', userCredential.user.email);
            } else {
                throw error;
            }
        }

        // Get the current user
        const user = auth.currentUser;
        if (!user) throw new Error('No user found');

        // Set user role in Firestore
        await db.collection('users').doc(user.uid).set({
            email: email,
            role: role,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return user;
    } catch (error) {
        console.error('Error in createUser:', error);
        throw error;
    }
}

// Function to check user role
async function checkUserRole(user) {
    if (!user) return null;
    
    try {
        const doc = await db.collection('users').doc(user.uid).get();
        return doc.exists ? doc.data().role : null;
    } catch (error) {
        console.error('Error checking user role:', error);
        return null;
    }
}

// Create test users
async function setupTestUsers() {
    try {
        await createUser('admin@eggbucket.com', 'admin123', 'admin');
        await createUser('retail@eggbucket.com', 'retail123', 'retail');
        console.log('Test users setup completed');
    } catch (error) {
        console.error('Error setting up test users:', error);
    }
}

// Export functions
window.createUser = createUser;
window.checkUserRole = checkUserRole;

// Setup test users when the page loads
setupTestUsers();
