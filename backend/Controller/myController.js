    import admin from 'firebase-admin';
    import { getFirestore } from "firebase-admin/firestore"

    const login = async (req, res) => {
    const { username, password, role } = req.body;

    try {
        const db = getFirestore();
        const docRef = db.collection('Authentication').doc(role);
        const doc = await docRef.get();
        if (!doc.exists) {
        return res.status(404).json({ message: 'Role not found' });
        }

        const userData = doc.data();

        if (userData.username === username && userData.password === password) {
        return res.status(200).json({ message: 'Login successful' });
        }

        return res.status(401).json({ message: 'Invalid username or password' });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ message: 'Server error' });
    }
    };

    export { login };
