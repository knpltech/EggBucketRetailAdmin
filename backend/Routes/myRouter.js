import express from "express";

const router = express.Router();

import { login } from "../Controller/myController.js";

router.route("/login").post(login);

export default router;
