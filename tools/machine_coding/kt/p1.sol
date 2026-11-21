class LRUCache(private val capacity: Int) {
    private class Node(val key: Int, var value: Int) {
        var prev: Node? = null
        var next: Node? = null
    }

    private val map = HashMap<Int, Node>()
    private val head = Node(0, 0)   // sentinel: most recent side
    private val tail = Node(0, 0)   // sentinel: least recent side

    init { head.next = tail; tail.prev = head }

    fun get(key: Int): Int {
        val node = map[key] ?: return -1
        moveToFront(node)
        return node.value
    }

    fun put(key: Int, value: Int) {
        val existing = map[key]
        if (existing != null) {
            existing.value = value
            moveToFront(existing)
            return
        }
        if (map.size == capacity) {
            val lru = tail.prev!!
            unlink(lru)
            map.remove(lru.key)
        }
        val node = Node(key, value)
        map[key] = node
        addFront(node)
    }

    private fun unlink(n: Node) { n.prev!!.next = n.next; n.next!!.prev = n.prev }
    private fun addFront(n: Node) { n.next = head.next; n.prev = head; head.next!!.prev = n; head.next = n }
    private fun moveToFront(n: Node) { unlink(n); addFront(n) }
}
