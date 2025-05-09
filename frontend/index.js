// Import Firebase instance and auth functions
import { 
    auth, 
    db, 
    signInWithEmailAndPassword, 
    onAuthStateChanged 
} from './firebase.js';

// DOM Elements
const adminLoginBtn = document.getElementById('admin-login-btn');
const retailLoginBtn = document.getElementById('retail-login-btn');
const loginForm = document.getElementById('login-form');
const loginTitle = document.getElementById('login-title');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const submitLogin = document.getElementById('submit-login');
const backBtn = document.getElementById('back-btn');
const errorMessage = document.getElementById('error-message');

// Track current login type
let currentLoginType = null;

// Test credentials
const TEST_CREDENTIALS = {
    admin: {
        email: 'admin@eggbucket.com',
        password: 'admin123'
    },
    retail: {
        email: 'retail@eggbucket.com',
        password: 'retail123'
    }
};

// Show error message
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

// Clear error message
function clearError() {
    errorMessage.textContent = '';
    errorMessage.style.display = 'none';
}

// Set loading state
function setLoading(isLoading) {
    submitLogin.disabled = isLoading;
    submitLogin.textContent = isLoading ? 'Logging in...' : 'Login';
}

// Show login form
function showLoginForm(type) {
    currentLoginType = type;
    document.querySelector('.login-options').style.display = 'none';
    loginForm.style.display = 'block';
    loginTitle.textContent = `${type.charAt(0).toUpperCase() + type.slice(1)} Login`;
    
    // Pre-fill test credentials
    loginEmail.value = TEST_CREDENTIALS[type].email;
    loginPassword.value = TEST_CREDENTIALS[type].password;
    
    // Focus on email field
    loginEmail.focus();
}

// Reset to login options
function resetToOptions() {
    currentLoginType = null;
    loginForm.style.display = 'none';
    document.querySelector('.login-options').style.display = 'block';
    loginForm.reset();
    clearError();
}

// Handle successful login
async function handleSuccessfulLogin(user) {
    try {
        const role = await checkUserRole(user);
        
        if (!role) {
            throw new Error('User role not found');
        }

        if (currentLoginType === role) {
            window.location.href = `${role}.html`;
        } else {
            throw new Error(`Invalid permissions for ${currentLoginType} login`);
        }
    } catch (error) {
        console.error('Login error:', error);
        await auth.signOut();
        throw error;
    }
}

// Check user role
async function checkUserRole(user) {
    try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists) {
            return null;
        }

        const userData = userDoc.data();
        return userData.role;
    } catch (error) {
        console.error('Error checking user role:', error);
        return null;
    }
}

// Check if user is already logged in
auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            const role = await checkUserRole(user);
            if (role) {
                window.location.href = `${role}.html`;
            } else {
                await auth.signOut();
            }
        } catch (error) {
            console.error('Auth state error:', error);
            await auth.signOut();
        }
    }
});

// Event Listeners
adminLoginBtn.addEventListener('click', () => showLoginForm('admin'));
retailLoginBtn.addEventListener('click', () => showLoginForm('retail'));
backBtn.addEventListener('click', resetToOptions);

// Login form submission
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    
    try {
        const email = loginEmail.value.trim();
        const password = loginPassword.value;
        
        // Basic validation
        if (!email || !password) {
            throw new Error('Please fill in all fields');
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new Error('Please enter a valid email address');
        }
        
        // Attempt login
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        await handleSuccessfulLogin(userCredential.user);
        
    } catch (error) {
        console.error('Login error:', error);
        let errorText = 'Login failed. Please try again.';
        
        switch (error.code) {
            case 'auth/invalid-email':
                errorText = 'Invalid email format';
                break;
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                errorText = 'Invalid email or password';
                break;
            case 'auth/user-not-found':
                errorText = 'No account found with this email';
                break;
            case 'auth/too-many-requests':
                errorText = 'Too many failed attempts. Try again later';
                break;
            default:
                if (error.message) {
                    errorText = error.message;
                }
        }
        
        showError(errorText);
    } finally {
        setLoading(false);
    }
});