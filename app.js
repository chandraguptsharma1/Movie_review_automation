import express from "express";
import cors from "cors";

import movieRoutes from "./src/routes/movie.routes.js";
import reviewRoutes from "./src/routes/review.routes.js";
import scriptRoutes from "./src/routes/script.routes.js";

const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*" }));
app.use(express.json({ limit: "2mb" }));

// Routes
app.use("/api", movieRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/scripts", scriptRoutes);

// Health check
app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

export default app;
