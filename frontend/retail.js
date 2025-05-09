// retail.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.x.x/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.x.x/firebase-auth.js';
import { getFirestore, collection, query, where, getDocs, addDoc, orderBy } from 'https://www.gstatic.com/firebasejs/10.x.x/firebase-firestore.js';

// Initialize Firebase
const firebaseConfig = {
    apiKey: "AIzaSyC_7uxANcO2d24cu1NhZXePjBTUUiQlg8w",
    authDomain: "eggbucket-retail.firebaseapp.com",
    projectId: "eggbucket-retail",
    storageBucket: "eggbucket-retail.firebasestorage.app",
    messagingSenderId: "622280717027",
    appId: "1:622280717027:web:4aaa62dd8800f40914cbd6",
    measurementId: "G-GDWHZ5RQ55"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Auth state observer
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'index.html';
    } else {
        loadUserData(user.uid);
    }
});

// Load user data
async function loadUserData(userId) {
    await Promise.all([
        loadOrders(userId),
        loadDeliveries(userId),
        loadPayments(userId)
    ]);
}

// Place new order
const orderForm = document.getElementById('order-form');
orderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const quantity = document.getElementById('quantity').value;
    const deliveryAddress = document.getElementById('delivery-address').value;
    
    try {
        await addDoc(collection(db, "orders"), {
            userId: auth.currentUser.uid,
            quantity: parseInt(quantity),
            deliveryAddress,
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date()
        });
        
        orderForm.reset();
        await loadOrders(auth.currentUser.uid);
    } catch (error) {
        console.error("Error placing order:", error);
        alert("Failed to place order. Please try again.");
    }
});

// Load orders
async function loadOrders(userId) {
    try {
        const q = query(
            collection(db, "orders"),
            where("userId", "==", userId),
            orderBy("createdAt", "desc")
        );
        
        const querySnapshot = await getDocs(q);
        const ordersList = document.getElementById('orders-list');
        ordersList.innerHTML = '';
        
        querySnapshot.forEach((doc) => {
            const order = doc.data();
            ordersList.innerHTML += `
                <div class="order-item">
                    <p>Order ID: ${doc.id}</p>
                    <p>Quantity: ${order.quantity}</p>
                    <p>Status: ${order.status}</p>
                    <p>Created: ${order.createdAt.toDate().toLocaleString()}</p>
                </div>
            `;
        });
    } catch (error) {
        console.error("Error loading orders:", error);
    }
}

// Load deliveries
async function loadDeliveries(userId) {
    try {
        const ordersQuery = query(collection(db, "orders"), where("userId", "==", userId));
        const ordersSnapshot = await getDocs(ordersQuery);
        const orderIds = ordersSnapshot.docs.map(doc => doc.id);
        
        const deliveriesQuery = query(
            collection(db, "deliveries"),
            where("orderId", "in", orderIds)
        );
        
        const deliveriesSnapshot = await getDocs(deliveriesQuery);
        const deliveriesList = document.getElementById('deliveries-list');
        deliveriesList.innerHTML = '';
        
        deliveriesSnapshot.forEach((doc) => {
            const delivery = doc.data();
            deliveriesList.innerHTML += `
                <div class="delivery-item">
                    <p>Order ID: ${delivery.orderId}</p>
                    <p>Status: ${delivery.status}</p>
                    <p>Expected Delivery: ${delivery.expectedDelivery?.toDate().toLocaleString() || 'TBD'}</p>
                </div>
            `;
        });
    } catch (error) {
        console.error("Error loading deliveries:", error);
    }
}

// Load payments
async function loadPayments(userId) {
    try {
        const ordersQuery = query(collection(db, "orders"), where("userId", "==", userId));
        const ordersSnapshot = await getDocs(ordersQuery);
        const orderIds = ordersSnapshot.docs.map(doc => doc.id);
        
        const paymentsQuery = query(
            collection(db, "payments"),
            where("orderId", "in", orderIds)
        );
        
        const paymentsSnapshot = await getDocs(paymentsQuery);
        const paymentsList = document.getElementById('payments-list');
        paymentsList.innerHTML = '';
        
        paymentsSnapshot.forEach((doc) => {
            const payment = doc.data();
            paymentsList.innerHTML += `
                <div class="payment-item">
                    <p>Order ID: ${payment.orderId}</p>
                    <p>Amount: ₹${payment.amount}</p>
                    <p>Status: ${payment.status}</p>
                    <p>Date: ${payment.date.toDate().toLocaleString()}</p>
                </div>
            `;
        });
    } catch (error) {
        console.error("Error loading payments:", error);
    }
}

// Handle logout
window.handleLogout = async () => {
    try {
        await signOut(auth);
        window.location.href = 'index.html';
    } catch (error) {
        console.error("Error signing out:", error);
        alert("Failed to sign out. Please try again.");
    }
};