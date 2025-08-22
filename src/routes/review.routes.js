import { Router } from "express";
import { addReview, getReviews } from "../controllers/review.controller.js";

const router = Router();

router.post("/", addReview);
router.get("/:movieId", getReviews);

export default router;
