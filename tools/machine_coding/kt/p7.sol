class TTLCache<K, V>(private val defaultTtlMs: Long = 5000L) {
    private data class Entry<V>(val value: V, val expiresAt: Long)

    private val map = HashMap<K, Entry<V>>()

    private fun now() = System.currentTimeMillis()

    @Synchronized
    fun put(key: K, value: V, ttlMs: Long = defaultTtlMs) {
        map[key] = Entry(value, now() + ttlMs)
    }

    @Synchronized
    fun get(key: K): V? {
        val e = map[key] ?: return null
        if (now() >= e.expiresAt) { map.remove(key); return null }   // lazy expiry
        return e.value
    }

    @Synchronized
    fun evictExpired() {
        val t = now()
        map.entries.removeIf { t >= it.value.expiresAt }
    }

    @Synchronized
    fun size(): Int {
        val t = now()
        return map.values.count { t < it.expiresAt }
    }
}
