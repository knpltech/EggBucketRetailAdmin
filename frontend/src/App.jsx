import { Routes, Route, Navigate } from "react-router-dom";

import Login from "./AdminPages/Login";

import AdminDashboard from "./AdminPages/AdminDashboard";
import CustomerInfo from "./AdminPages/CustomerInfo";
import AddDeliveryPartner from "./AdminPages/AddDeliveryPartner";
import AddSalesPerson from "./AdminPages/AddSalesPerson";
import AddCustomer from "./AdminPages/AddCustomer";
import PersonnelList from "./AdminPages/PersonnelList";
import Customer from "./AdminPages/Customer";
import Report from "./AdminPages/Report";
import Analytics from "./AdminPages/Analytics";
import CustomerView from "./Admin-View/CustomerView";
import CustomerDetails from "./CustomerPages/CustomerDetails";
import PersonnelView from "./Admin-View/PersonalView";
import ReportView from "./Admin-View/ReportView";
import AnalyticsView from "./Admin-View/AnalyticsView";
import AdminViewDashboard from "./Admin-View/Admin-ViewDashboard";
import AboutVPage from "./Admin-View/aboutView";
import CustomerMapForDelivery from "./AdminPages/CustomerMapForDelivery";
import CustomerManagement from "./AdminPages/CustomerManagement";

function ProtectedRoute({ allowedRoles, children }) {
  const isLoggedIn = localStorage.getItem("loggedIn") === "true";
  const authToken = localStorage.getItem("authToken");
  const userType = localStorage.getItem("userType");

  if (!isLoggedIn || !authToken) {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles?.length && !allowedRoles.includes(userType)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />

      {/*Admin Routes*/}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["admin", "supervisor"]}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      >
        {/*Admin dashboard for navigation */}
        <Route
          index
          element={
            <div>
              <h2 className="text-2xl font-semibold">About EggBucket</h2>
              <p>
                Welcome to EggBucket's admin dashboard. Manage your delivery
                partners, sales personnel, and customer information here.
              </p>
            </div>
          }
        />
        <Route path="customers" element={<CustomerInfo />} />
        <Route path="add-delivery" element={<AddDeliveryPartner />} />
        <Route path="add-sales" element={<AddSalesPerson />} />
        <Route path="add-customer" element={<AddCustomer />} />
        <Route path="personnel" element={<PersonnelList />} />
        <Route path="customer-info/:id" element={<Customer />} />
        <Route path="report" element={<Report />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="customer-management" element={<CustomerManagement />} />
        <Route
          path="customer-map-for-delivery"
          element={<CustomerMapForDelivery />}
        />
      </Route>

      <Route
        path="/admin-view"
        element={
          <ProtectedRoute allowedRoles={["admin-view", "admin"]}>
            <AdminViewDashboard />
          </ProtectedRoute>
        }
      >
        <Route index element={<AboutVPage />} />
        <Route path="customerView" element={<CustomerView />} />
        <Route path="personalView" element={<PersonnelView />} />
        <Route path="reportView" element={<ReportView />} />
        <Route path="analyticsView" element={<AnalyticsView />} />
        <Route path="about" element={<AboutVPage />} />
      </Route>
    </Routes>
  );
}

export default App;
