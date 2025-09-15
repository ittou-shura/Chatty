import express from "express";
import { getPublicKey, getUsers } from "../controllers/user.controllers.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protectRoute, getUsers);
router.get("/public-key/:userId", getPublicKey);

export default router;