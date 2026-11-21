// Local stand-in for the few kotlinx.coroutines APIs problem 5 uses (the real library is used in the browser editor).
package kotlinx.coroutines
import kotlin.coroutines.*
interface CoroutineScope
open class CancellationException(message: String? = null) : IllegalStateException(message)
suspend fun delay(timeMillis: Long) { Thread.sleep(timeMillis) }
fun <T> runBlocking(block: suspend CoroutineScope.() -> T): T {
    var result: Result<T>? = null
    block.startCoroutine(object : CoroutineScope {}, Continuation(EmptyCoroutineContext) { result = it })
    return result!!.getOrThrow()
}
