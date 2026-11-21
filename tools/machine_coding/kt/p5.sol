suspend fun <T> retryWithBackoff(
    maxAttempts: Int = 3,
    initialDelayMs: Long = 100L,
    multiplier: Double = 2.0,
    maxDelayMs: Long = 5000L,
    block: suspend () -> T
): T {
    require(maxAttempts >= 1) { "maxAttempts must be at least 1" }
    var nextDelay = initialDelayMs.toDouble()
    repeat(maxAttempts - 1) {
        try {
            return block()
        } catch (e: CancellationException) {
            throw e                       // never swallow cancellation
        } catch (e: Exception) {
            delay(minOf(nextDelay.toLong(), maxDelayMs))
            nextDelay *= multiplier
        }
    }
    return block()                        // last attempt: let its exception propagate
}
