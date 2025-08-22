import { Router } from "express";
import {
    getTrending,
    searchMovies,
    getGenres,
    getMoviesByGenre,
    getHindiMovies,
    getHindiByGenre,
} from "../controllers/movie.controller.js";

const router = Router();

router.get("/trending", getTrending);
router.get("/search", searchMovies);
router.get("/genres", getGenres);
router.get("/movies/by-genre", getMoviesByGenre);
router.get("/movies/hindi", getHindiMovies);
router.get("/movies/hindi/by-genre", getHindiByGenre);

export default router;
