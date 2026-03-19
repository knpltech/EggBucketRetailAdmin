import express from "express";
import multer from "multer";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// import different function from AdminController.js
import {
  login,
  userInfo,
  specificUser,
  deleteCustomer,
  updateCustomer,
  addDeliveryPartner,
  addSalesPerson,
  getSalesPartners,
  getDeliveryPartners,
  updateDeliveryPartner,
  updateSalesPartner,
  deleteDeliveryPartner,
  deleteSalesPartner,
  getUserDeliveries,
  getAllCustomerDeliveries,
  toggleDeliveryPerson,
  toggleSalesPerson,
  addCustomer,
  getCustomerMapStatus,
  updateCustomerMeta,
  addZone,
  getZones,
  getAnalyticsLast8,
  recalculateAllCategories,
  saveCheckedReason,
  resetAllCheckedReasons,
  saveDeliveredTrays,
  getAllCustomerDeliveriesRange,
  getCustomersByDeliveryCount,
  getLatestRemarks,
} from "../Controller/AdminController.js";

// Customer routes
router.route("/login").post(login);
router.use(authenticateToken);

router.route("/user-info").get(userInfo);
router.get("/customer-info/:id", specificUser);
router.delete("/customer/delete", deleteCustomer);
router.put("/customer/update", updateCustomer);
router.get("/customer/deliveries/:id", getUserDeliveries);
router.get("/all-deliveries", getAllCustomerDeliveries);
router.post("/add-customer", upload.single("image"), addCustomer);
router.post("/customer/status", updateCustomerMeta);
router.post("/customer/delivery-reason", saveCheckedReason);
router.post("/customer/delivery-reason/reset-all", resetAllCheckedReasons);
router.post("/customer/delivery-trays", saveDeliveredTrays);
router.post("/zones/add", addZone);
router.get("/zones", getZones);

router.get("/analytics/last8", getAnalyticsLast8);
router.post("/customer/recalculate", recalculateAllCategories);
router.get("/all-deliveries-range", getAllCustomerDeliveriesRange);
router.get("/customer/by-delivery-count", getCustomersByDeliveryCount);
router.get("/customer/latest-remarks", getLatestRemarks);

// Delivery partner related routes
router.post("/add-del-partner", addDeliveryPartner);
router.get("/get-del-partner", getDeliveryPartners);
router.put("/delivery/update", updateDeliveryPartner);
router.delete("/delivery/delete", deleteDeliveryPartner);
router.put("/delivery/toggle/:id", toggleDeliveryPerson);
router.get("/customer-map-status", getCustomerMapStatus);

// Sales person related routes
router.post("/add-sales-partner", addSalesPerson);
router.get("/get-sales-partner", getSalesPartners);
router.put("/sales/update", updateSalesPartner);
router.delete("/sales/delete", deleteSalesPartner);
router.put("/sales/toggle/:id", toggleSalesPerson);

export default router;
