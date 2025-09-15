import express from "express";
import { getPublicKey, getUsers } from "../controllers/user.controllers.js";

const router = express.Router();

router.get("/", getUsers);
router.get("/public-key/:userId", getPublicKey);

export default router;