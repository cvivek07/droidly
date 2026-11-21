class EventBus {
    private val listeners = HashMap<String, LinkedHashMap<String, (Any) -> Unit>>()
    private val typeOf = HashMap<String, String>()   // subscriptionId -> eventType
    private var nextId = 0

    @Synchronized
    fun subscribe(eventType: String, listener: (Any) -> Unit): String {
        val id = "sub-${++nextId}"
        listeners.getOrPut(eventType) { LinkedHashMap() }[id] = listener
        typeOf[id] = eventType
        return id
    }

    @Synchronized
    fun unsubscribe(subscriptionId: String) {
        val type = typeOf.remove(subscriptionId) ?: return   // unknown id: nothing to do
        val forType = listeners[type] ?: return
        forType.remove(subscriptionId)
        if (forType.isEmpty()) listeners.remove(type)         // no empty entries left behind
    }

    fun publish(eventType: String, data: Any) {
        val snapshot = synchronized(this) { listeners[eventType]?.values?.toList() } ?: return
        snapshot.forEach { it(data) }                        // a copy, so listeners may (un)subscribe safely
    }
}
