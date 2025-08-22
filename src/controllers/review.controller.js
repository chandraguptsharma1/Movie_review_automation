// Dummy in-memory store
let reviews = [];

// ✅ Add review
export function addReview(req, res) {
    const { movieId, text, rating } = req.body;
    if (!movieId || !text) {
        return res.status(400).json({ ok: false, error: "movieId & text required" });
    }
    const review = { id: Date.now(), movieId, text, rating: rating || 0 };
    reviews.push(review);
    res.json({ ok: true, review });
}

// ✅ Get reviews by movieId
export function getReviews(req, res) {
    const { movieId } = req.params;
    const data = reviews.filter((r) => r.movieId == movieId);
    res.json({ ok: true, items: data });
}
