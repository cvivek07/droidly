// ---- Droidly test runner (hidden in the editor) ----
private var passedCount = 0
private var totalCount = 0
private fun record(name: String, error: Throwable?) {
    totalCount++
    when (error) {
        null -> { passedCount++; println("✓ $name") }
        is NotImplementedError -> println("✗ $name — not implemented yet")
        is AssertionError -> println("✗ $name — ${error.message}")
        else -> println("✗ $name — threw ${error::class.simpleName}: ${error.message}")
    }
}
fun test(name: String, body: () -> Unit) = record(name, runCatching(body).exceptionOrNull())
fun <T> expect(actual: T, expected: T, what: String = "") {
    if (actual != expected) throw AssertionError((if (what.isEmpty()) "" else "$what: ") + "expected $expected, got $actual")
}
fun expectTrue(cond: Boolean, message: String) { if (!cond) throw AssertionError(message) }
fun summary() {
    println()
    if (passedCount == totalCount) println("ALL " + totalCount + " TESTS PASSED")
    else println("" + passedCount + " of " + totalCount + " tests passed")
}
