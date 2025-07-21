import { Routes, Route, Navigate } from 'react-router-dom';

import Login from './AdminPages/Login';

import AdminDashboard from './AdminPages/AdminDashboard';
import CustomerInfo from './AdminPages/CustomerInfo';
import AddDeliveryPartner from './AdminPages/AddDeliveryPartner';
import AddSalesPerson from './AdminPages/AddSalesPerson';
import AddCustomer from './AdminPages/AddCustomer';
import PersonnelList from './AdminPages/PersonnelList';
import Customer from './AdminPages/Customer';
import Report from './AdminPages/Report';

import CustomerDetails from './CustomerPages/CustomerDetails';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />

      {/*Admin Routes*/}
      <Route path="/admin" element={<AdminDashboard />}>    {/*Admin dashboard for navigation */}
        <Route index element={
          <div>
            <h2 className="text-2xl font-semibold">About EggBucket</h2>
            <p>
              Welcome to EggBucket's admin dashboard. Manage your delivery partners, sales personnel, and customer
              information here.
            </p>
          </div>
        } />
        <Route path="customers" element={<CustomerInfo />} />
        <Route path="add-delivery" element={<AddDeliveryPartner />} />
        <Route path="add-sales" element={<AddSalesPerson />} />
        <Route path="add-customer" element={<AddCustomer />} />
        <Route path="personnel" element={<PersonnelList />} />
        <Route path="customer-info/:id" element={<Customer />} />
        <Route path="report" element={<Report />} />

      </Route>


      {/*Customer Routes*/}
      <Route path="/supervisor" element={<CustomerDetails />}></Route>
    </Routes>
  );
}

export default App;