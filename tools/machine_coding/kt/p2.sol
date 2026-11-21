class TokenBucketRateLimiter(
    private val maxTokens: Int,
    private val refillRatePerSecond: Double
) {
    private class Bucket(var tokens: Double, var lastRefillNanos: Long)

    private val buckets = HashMap<String, Bucket>()

    @Synchronized
    fun isAllowed(userId: String): Boolean {
        val now = System.nanoTime()
        val bucket = buckets.getOrPut(userId) { Bucket(maxTokens.toDouble(), now) }
        val elapsedSeconds = (now - bucket.lastRefillNanos) / 1_000_000_000.0
        bucket.tokens = minOf(maxTokens.toDouble(), bucket.tokens + elapsedSeconds * refillRatePerSecond)
        bucket.lastRefillNanos = now
        if (bucket.tokens >= 1.0) {
            bucket.tokens -= 1.0
            return true
        }
        return false
    }
}
