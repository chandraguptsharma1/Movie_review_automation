import axios from "axios";

export const TMDB = axios.create({
    baseURL: "https://api.themoviedb.org/3",
    params: { api_key: process.env.TMDB_KEY }, // v3 key
});

export function mapMovie(m) {
    return {
        id: m.id,
        title: m.title || m.original_title,
        overview: m.overview || "",
        year: (m.release_date || "").slice(0, 4),
        poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
    };
}
