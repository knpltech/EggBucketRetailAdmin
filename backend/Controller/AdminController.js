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

const userInfo = async (req, res) => {
    try {
        const db = getFirestore();
        const customersSnapshot = await db.collection('customers').get();
        const customers = [];

        for (const doc of customersSnapshot.docs) {
            const customerData = doc.data();
            const deliveriesSnapshot = await db
                .collection('customer')
                .doc(doc.id)
                .collection('deliveries')
                .get();

            const deliveries = deliveriesSnapshot.docs.map(deliveryDoc => ({
                id: deliveryDoc.id,
                ...deliveryDoc.data()
            }));

            customers.push({
                id: doc.id,
                ...customerData,
                deliveries
            });
        }
        res.status(200).json(customers);
    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).json({ error: 'Failed to fetch customer data' });
    }
};

const specificUser = async (req, res) => {
    try {
        const db = getFirestore();
        const userId = req.params.id;

        const userDoc = await db.collection('customers').doc(userId).get();

        if (!userDoc.exists) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        res.status(200).json({ id: userDoc.id, ...userDoc.data() });
    } catch (error) {
        console.error('Error fetching customer:', error);
        res.status(500).json({ error: 'Failed to fetch customer data' });
    }
};

// Utility to delete a subcollection (since Firestore doesn't auto-delete subcollections)
const deleteSubcollection = async (parentDocRef, subcollectionName) => {
    const subcollectionSnapshot = await parentDocRef.collection(subcollectionName).get();

    const batch = getFirestore().batch();
    subcollectionSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
    });

    await batch.commit();
};

const deleteCustomer = async (req, res) => {
    const { id } = req.body;

    if (!id) {
        return res.status(400).json({ message: 'Customer ID is required' });
    }

    try {
        const db = getFirestore();
        const customerRef = db.collection('customers').doc(id);

        const customerDoc = await customerRef.get();

        if (!customerDoc.exists) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        // Optionally delete subcollections (like 'deliveries')
        // await deleteSubcollection(customerRef, 'deliveries');

        await customerRef.delete();

        return res.status(200).json({ message: 'Customer deleted successfully' });
    } catch (error) {
        console.error('Error deleting customer:', error);
        return res.status(500).json({ message: 'Failed to delete customer' });
    }
};

const updateCustomer = async (req, res) => {
    const { id, name, business, phone } = req.body;
    if (!id || !name || !business || !phone) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        const db = getFirestore();
        const customerRef = db.collection('customers').doc(id);

        const customerDoc = await customerRef.get();

        if (!customerDoc.exists) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        await customerRef.update({ name, business, phone });

        return res.status(200).json({ message: 'Customer updated successfully' });
    } catch (error) {
        console.error('Error updating customer:', error);
        return res.status(500).json({ message: 'Failed to update customer' });
    }
};

const addDeliveryPartner = async (req, res) => {
    try {
        const { name, phone, password } = req.body;
        if (!name || !phone || !password) {
            return res.status(400).json({ message: 'Name, phone number, and password are required.' });
        }

        const db = getFirestore();
        const email = `${phone}@eggbucketdelivery.in`;

        try {
            await admin.auth().getUserByEmail(email);
            return res.status(400).json({ message: 'A delivery partner with this phone number already exists.' });
        } catch (error) {
            if (error.code !== 'auth/user-not-found') {
                throw error;
            }
        }
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: name,
        });

        await db.collection('DeliveryMan').doc(userRecord.uid).set({
            uid: userRecord.uid,
            name,
            phone,
            email,
            password,
        });

        res.status(201).json({ message: 'Delivery partner added successfully.' });
    } catch (err) {
        console.error('Error adding delivery partner:', err);
        res.status(500).json({ message: 'Server error while adding delivery partner.' });
    }
};

const addSalesPerson = async (req, res) => {
    try {
        const { name, phone, password } = req.body;

        if (!name || !phone || !password) {
            return res.status(400).json({ message: 'Name, phone number, and password are required.' });
        }

        const db = getFirestore();
        const email = `${phone}@eggbucketsales.in`;

        // Check if user already exists
        try {
            await admin.auth().getUserByEmail(email);
            return res.status(400).json({ message: 'A salesperson with this phone number already exists.' });
        } catch (error) {
            if (error.code !== 'auth/user-not-found') {
                throw error;
            }
        }

        const docSnap = await db.collection("globalcounter").doc("salescounter").get();
        const counterData = docSnap.data();
        const currentCount = counterData?.counter || 0;

        // Create the user
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: name,
        });

        await db.collection('Salesman').doc(userRecord.uid).set({
            uid: userRecord.uid,
            name,
            phone,
            email,
            password,
            sales_id: `S${currentCount + 1}`,
        });

        await db.collection("globalcounter").doc("salescounter").update({
            counter: currentCount + 1
        });

        res.status(201).json({ message: 'Salesperson added successfully.' });
    } catch (err) {
        console.error('Error adding salesperson:', err);
        res.status(500).json({ message: 'Server error while adding salesperson.' });
    }
};

const getDeliveryPartners = async (req, res) => {
    try {
        const db = getFirestore();
        const snapshot = await db.collection('DeliveryMan').get();

        const deliveryPartners = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.status(200).json(deliveryPartners);
    } catch (err) {
        console.error('Error fetching delivery partners:', err);
        res.status(500).json({ message: 'Failed to fetch delivery partners.' });
    }
};

const getSalesPartners = async (req, res) => {
    try {
        const db = getFirestore();
        const snapshot = await db.collection('Salesman').get();

        const salesPartners = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.status(200).json(salesPartners);
    } catch (err) {
        console.error('Error fetching sales partners:', err);
        res.status(500).json({ message: 'Failed to fetch sales partners.' });
    }
};

const updateDeliveryPartner = async (req, res) => {
    try {
        const { uid, name, phone } = req.body;
        if (!uid || !name || !phone) {
            return res.status(400).json({ message: 'UID, name, and phone number are required.' });
        }
        const newEmail = `${phone}@eggbucketdelivery.in`;
        await admin.auth().updateUser(uid, {
            email: newEmail,
            displayName: name,
        });

        const db = getFirestore();
        await db.collection('DeliveryMan').doc(uid).update({
            name,
            phone,
            email: newEmail,
        });

        res.status(200).json({ message: 'Delivery partner updated successfully.' });
    } catch (err) {
        console.error('Error updating delivery partner:', err);
        res.status(500).json({ message: 'Server error while updating delivery partner.' });
    }
};

const updateSalesPartner = async (req, res) => {
    try {
        const { uid, name, phone } = req.body;
        if (!uid || !name || !phone) {
            return res.status(400).json({ message: 'UID, name, and phone number are required.' });
        }
        const newEmail = `${phone}@eggbucketsales.in`;
        await admin.auth().updateUser(uid, {
            email: newEmail,
            displayName: name,
        });

        await getFirestore().collection('Salesman').doc(uid).update({
            name,
            phone,
            email: newEmail,
        });

        res.status(200).json({ message: 'Salesperson updated successfully.' });
    } catch (err) {
        console.error('Error updating salesperson:', err);
        res.status(500).json({ message: 'Server error while updating salesperson.' });
    }
};

const deleteDeliveryPartner = async (req, res) => {
    try {
        const { id } = req.body;
        const db = getFirestore();
        const docRef = db.collection('DeliveryMan').doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            return res.status(404).json({ message: 'Delivery partner not found.' });
        }

        const { uid } = docSnap.data();
        await docRef.delete();

        if (uid) {
            await admin.auth().deleteUser(uid);
        }

        res.status(200).json({ message: 'Delivery partner deleted successfully.' });
    } catch (err) {
        console.error('Error deleting delivery partner:', err);
        res.status(500).json({ message: 'Server error while deleting delivery partner.' });
    }
};

const deleteSalesPartner = async (req, res) => {
    try {
        const { id } = req.body;
        const db = getFirestore();
        const docRef = db.collection('Salesman').doc(id);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
            return res.status(404).json({ message: 'Sales partner not found.' });
        }
        const { uid } = docSnap.data();
        await docRef.delete();
        if (uid) {
            await admin.auth().deleteUser(uid);
        }

        res.status(200).json({ message: 'Sales partner deleted successfully.' });
    } catch (err) {
        console.error('Error deleting sales partner:', err);
        res.status(500).json({ message: 'Server error while deleting sales partner.' });
    }
};



export {
    login,
    userInfo,
    specificUser,
    deleteCustomer,
    updateCustomer,
    addDeliveryPartner,
    addSalesPerson,
    getDeliveryPartners,
    getSalesPartners,
    updateDeliveryPartner,
    updateSalesPartner,
    deleteDeliveryPartner,
    deleteSalesPartner
};
