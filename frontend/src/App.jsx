import { Routes, Route, Navigate } from 'react-router-dom';

import Login from './AdminPages/Login';

import AdminDashboard from './AdminPages/AdminDashboard';
import CustomerInfo from './AdminPages/CustomerInfo';
import AddDeliveryPartner from './AdminPages/AddDeliveryPartner';
import AddSalesPerson from './AdminPages/AddSalesPerson';
import PersonnelList from './AdminPages/PersonnelList';
import Sales from './AdminPages/Sales';

import RetailDashboard from './RetailPages/RetailDashboard';
import Orders from './RetailPages/Orders';
import Deliveries from './RetailPages/Deliveries';
import Payments from './RetailPages/Payments';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />

      {/*Admin Routes*/}
      <Route path="/admin" element={<AdminDashboard />}>
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
        <Route path="personnel" element={<PersonnelList />} />
        <Route path="sales" element={<Sales />} />
      </Route>


      {/*Retail Routes*/}
      <Route path="/retail" element={<RetailDashboard />}>
        <Route index element={<Orders />} />
        <Route path="orders" element={<Orders />} />
        <Route path="deliveries" element={<Deliveries />} />
        <Route path="payments" element={<Payments />} />
      </Route>

    </Routes>
  );
}

export default App;