from common import X, S

DEEP = {}

DEEP['coroutines'] = [
X([S('The problem coroutines solve', [
    "Android has one main thread that draws the screen. If you call the network on it, the app freezes. The old fixes were threads and callbacks. Threads are expensive (each one needs about 1 MB of memory), and callbacks nest inside each other until the code is hard to read. People call that \"callback hell\".",
    "A coroutine lets you write the same work as plain top-to-bottom code. When it has to wait, for example for a network response, it **suspends**: it steps aside and frees the thread so other work can run. When the answer arrives, it continues from the same line."],
    code=('Callbacks vs a coroutine', '''// Callbacks: nested and hard to follow
api.login(user) { token ->
    api.profile(token) { profile ->
        runOnUiThread { show(profile) }
    }
}

// Coroutine: reads top to bottom, same behaviour
viewModelScope.launch {
    val token = api.login(user)        // suspends, thread is free meanwhile
    val profile = api.profile(token)
    show(profile)                      // back on Main automatically
}''')),
  S('Coroutines are cheap', [
    "A coroutine is just an object that remembers where it stopped. You can start 100,000 coroutines easily, while 100,000 threads would crash the app. Many coroutines share a small pool of threads, taking turns whenever one of them suspends."]),
  S('How suspending works (simple version)', [
    "The Kotlin compiler turns each `suspend` function into a small **state machine**. Each place where it can pause becomes a numbered step. When the function suspends, it saves its local variables and the step number in an object called a `Continuation`, then returns. When the result is ready, the continuation is called and the function jumps back to the saved step.",
    "That is why suspend functions have no special threads or magic. It is ordinary code, rewritten by the compiler so it can stop and resume."]),
 ],
 mistakes=[('Thinking `suspend` moves work to a background thread', 'It does not. Use `withContext(Dispatchers.IO)` for blocking work.'),
           ('Calling `Thread.sleep()` inside a coroutine', 'Use `delay()`, which suspends instead of blocking the thread.'),
           ('Starting coroutines with `GlobalScope`', 'Use a scope tied to a lifecycle, like `viewModelScope`.')],
 qa=('What is the difference between a thread and a coroutine?',
     "A thread is managed by the operating system and is expensive to create and switch. A coroutine is a lightweight task managed by Kotlin that runs on top of threads. Many coroutines can share one thread, because a coroutine gives up the thread whenever it suspends. Coroutines also come with structured concurrency, so cancelling a scope cancels all its work.")),

X([S('launch: start and forget', [
    "`launch` starts a coroutine and returns a `Job`. Use it when you do not need a result back, such as saving to the database or sending analytics. You can use the Job to cancel the work or wait for it with `join()`."]),
  S('async: start and get a result later', [
    "`async` starts a coroutine and returns a `Deferred<T>`, which is a promise of a value. Call `await()` to get it. The real power is running independent tasks **at the same time**: start several `async` blocks, then await them all."],
    code=('Sequential vs parallel', '''// Sequential: about 1s + 1s = 2s
val a = api.user()          // waits 1s
val b = api.orders()        // then waits 1s

// Parallel: about 1s total
coroutineScope {
    val a = async { api.user() }
    val b = async { api.orders() }
    show(a.await(), b.await())
}''')),
  S('Suspend functions in practice', [
    "Mark a function `suspend` when it calls other suspend functions or needs to wait. You can only call it from a coroutine or from another suspend function. That rule keeps waiting code from accidentally running on the main thread without a coroutine around it.",
    "`runBlocking` starts a coroutine and **blocks** the current thread until it finishes. It is useful in `main()` functions and old-style tests, but never on the Android main thread."]),
 ],
 mistakes=[('Using `async` and never calling `await()`', 'Use `launch` if you do not need the result; errors in async are only seen at await.'),
           ('Writing `async { }.await()` right away', 'That is just sequential code; call the function directly.'),
           ('Using `runBlocking` in app code', 'It freezes the thread; use a scope and `launch`.')],
 qa=('When would you use async instead of launch?',
     "Use async when you need a result back and especially when you want to run several independent calls in parallel, then combine the results with await. Use launch for work that does not return anything, such as saving data. Both should be started inside a proper scope so they are cancelled together.")),

X([S('What is a CoroutineScope?', [
    "A scope is a container for coroutines. Every coroutine is started inside one, and when the scope is cancelled, all its coroutines are cancelled too. On Android you rarely make your own: `viewModelScope` is cancelled when the ViewModel is cleared, and `lifecycleScope` when the Activity or Fragment is destroyed."]),
  S('Dispatchers decide the thread', [
    "**Dispatchers.Main**: the UI thread. Use it to update views. **Dispatchers.IO**: a big pool for waiting work like files, databases and network. **Dispatchers.Default**: a pool sized to the number of CPU cores, for heavy calculations like sorting large lists or parsing JSON.",
    "`Dispatchers.Main.immediate` runs right away if you are already on the main thread, instead of posting to the queue. `viewModelScope` uses it by default."],
    code=('Switching threads with withContext', '''suspend fun loadReport(): Report {
    val raw = withContext(Dispatchers.IO) {        // read file on IO
        File(path).readText()
    }
    return withContext(Dispatchers.Default) {      // heavy parsing on Default
        parseReport(raw)
    }
}   // the caller can stay on Main the whole time''')),
  S('CoroutineContext in one minute', [
    "Every coroutine carries a `CoroutineContext`, a small set of settings: the `Job`, the dispatcher, an optional name and an optional exception handler. You combine them with `+`, like `Dispatchers.IO + CoroutineName(\"sync\")`. Children inherit their parent's context unless you override parts of it."]),
 ],
 mistakes=[('Updating the UI from `Dispatchers.IO`', 'Switch back to Main, or return the value and let the caller update the UI.'),
           ('Using IO for heavy CPU work', 'Use `Dispatchers.Default`; IO is for waiting, not computing.'),
           ('Hard-coding dispatchers inside classes', 'Pass them in through the constructor so tests can replace them.')],
 qa=('What does "main-safe" mean?',
     "A main-safe function can be called from the main thread without freezing it. The function itself switches to the right dispatcher with withContext for any blocking or heavy work. Repositories and data sources should be main-safe, so ViewModels can call them from viewModelScope without thinking about threads.")),

X([S('Structured concurrency', [
    "Coroutines form a family tree. When you `launch` inside another coroutine, the new one is a **child**. A parent always waits for its children to finish, and cancelling a parent cancels every child. This makes it hard to leak work: when the screen closes, the whole tree stops.",
    "`coroutineScope { }` creates a child scope inside a suspend function. It finishes only when all coroutines inside it finish, and if one fails, the others are cancelled."]),
  S('How cancellation really works', [
    "Cancelling a coroutine does not stop it instantly. It marks the Job as cancelled, and the next time the code reaches a **suspension point** (like `delay`, `withContext` or a Room query), it throws `CancellationException`, which ends the coroutine cleanly.",
    "If your code is a long loop with no suspension points, it never notices. Add `ensureActive()` or check `isActive` inside the loop."],
    code=('A loop that respects cancellation', '''suspend fun findPrimes(limit: Int): List<Int> = withContext(Dispatchers.Default) {
    val result = mutableListOf<Int>()
    for (n in 2..limit) {
        ensureActive()                // throws if cancelled
        if (isPrime(n)) result += n
    }
    result
}''')),
  S('Cleaning up and timeouts', [
    "Use `try { } finally { }` to close resources when a coroutine is cancelled. If the cleanup itself needs to suspend, wrap it in `withContext(NonCancellable)`. To give up after a time limit, use `withTimeout(ms)` (throws) or `withTimeoutOrNull(ms)` (returns null)."]),
 ],
 mistakes=[('Catching `Exception` and ignoring it inside a coroutine', 'This also catches CancellationException; rethrow it or catch narrower types.'),
           ('Long CPU loops with no `ensureActive()`', 'Add a check so cancellation can stop the work.'),
           ('Using `launch` from a different scope inside a function', 'Use `coroutineScope { }` so child work belongs to the caller.')],
 qa=('What happens to child coroutines when the parent is cancelled?',
     "They are all cancelled too. Each child gets a CancellationException at its next suspension point and finishes. The parent completes only after all children are done. This is structured concurrency: work started in a scope cannot outlive the scope.")),

X([S('How failures travel up the tree', [
    "With a normal `Job`, if a child throws, the error goes up to the parent. The parent then cancels all its other children and fails too. This is good when the tasks belong together, such as loading three parts of one screen: if one fails, the rest are useless."]),
  S('SupervisorJob: let siblings live', [
    "A `SupervisorJob` (or `supervisorScope { }`) changes the rule: a failing child does not cancel its siblings or its parent. Use it when tasks are independent, like syncing contacts and photos. `viewModelScope` uses a SupervisorJob, so one failed request does not kill the whole ViewModel."],
    code=('Handling errors in the ViewModel', '''fun refresh() = viewModelScope.launch {
    _state.update { it.copy(loading = true) }
    try {
        val data = repo.load()
        _state.update { it.copy(loading = false, data = data) }
    } catch (e: IOException) {
        _state.update { it.copy(loading = false, error = "No internet connection") }
    }
}''')),
  S('launch vs async errors, and the handler', [
    "In `launch`, an exception is thrown as soon as it happens. In `async`, it is stored and thrown when you call `await()`. A `CoroutineExceptionHandler` is only a last place to log crashes; it works only on top-level coroutines and cannot recover from errors. Prefer `try/catch` close to the call."]),
 ],
 mistakes=[('Putting `try/catch` around `launch { }` instead of inside it', 'The launch returns immediately; catch inside the coroutine.'),
           ('Expecting CoroutineExceptionHandler to recover', 'It only logs; handle errors with try/catch.'),
           ('Using one `Job()` as parent for independent tasks', 'Use `SupervisorJob()` so one failure does not stop the rest.')],
 qa=('In a supervisorScope, one child throws. What happens to the other children and the scope?',
     "The other children keep running and the scope does not fail. Only the failing child is cancelled. Its exception still needs handling, either with try/catch inside that child or a CoroutineExceptionHandler, otherwise it is reported as uncaught.")),

X([S('Why testing coroutines needs special tools', [
    "Real coroutines use real threads and real time. A test that waits for `delay(5000)` would take 5 seconds, and code on `Dispatchers.Main` crashes in unit tests because there is no Android main thread. The `kotlinx-coroutines-test` library fixes both."]),
  S('runTest and virtual time', [
    "`runTest { }` runs your test in a coroutine with a **virtual clock**. When the code calls `delay(5000)`, the clock jumps ahead instantly. `advanceTimeBy(ms)` moves time forward by a set amount, and `advanceUntilIdle()` runs everything that is waiting."],
    code=('A Main dispatcher rule', '''class MainDispatcherRule(
    val dispatcher: TestDispatcher = UnconfinedTestDispatcher()
) : TestWatcher() {
    override fun starting(d: Description) = Dispatchers.setMain(dispatcher)
    override fun finished(d: Description) = Dispatchers.resetMain()
}

class SearchViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    @Test fun `debounces typing`() = runTest {
        val vm = SearchViewModel(FakeRepo())
        vm.onQuery("ko"); vm.onQuery("kotlin")
        advanceTimeBy(301)
        assertEquals(1, FakeRepo.calls)       // only one search after debounce
    }
}''')),
  S('Standard vs Unconfined test dispatchers', [
    "`StandardTestDispatcher` queues new coroutines and runs them only when you advance time or call `advanceUntilIdle()`. That gives you full control over order. `UnconfinedTestDispatcher` runs new coroutines right away, which is simpler for most ViewModel tests."]),
 ],
 mistakes=[('Using real `Thread.sleep` in tests', 'Use `runTest` and virtual time.'),
           ('Forgetting to set the Main dispatcher', 'Use a JUnit rule with `Dispatchers.setMain`.'),
           ('Creating a new TestDispatcher inside the class under test', 'Inject the same dispatcher the test controls.')],
 qa=('How do you test a ViewModel that calls a repository on Dispatchers.IO?',
     "Inject the dispatcher into the repository or ViewModel instead of hard-coding Dispatchers.IO. In the test, pass a TestDispatcher, set it as Main with a rule, run the test inside runTest, and call advanceUntilIdle before asserting. Use a fake repository so the test is fast and predictable.")),
]

DEEP['flows'] = [
X([S('One value vs many values', [
    "A suspend function returns **one** value later. A `Flow` returns **many** values over time, like a stream of search results, location updates or rows from a database that keep changing. You read a flow with `collect`, which runs your code for each value.",
    "Flows are built on coroutines, so they support cancellation and suspend functions inside them."]),
  S('Cold flows: nothing happens until you collect', [
    "The code inside `flow { }` does not run when you create the flow. It runs only when someone calls `collect`, and it runs again from the start for each new collector. That is why a flow from Retrofit or Room is safe to create anywhere: it does no work until it is collected."],
    code=('Creating and collecting', '''val numbers: Flow<Int> = flow {
    println("Started")
    for (i in 1..3) {
        delay(100)
        emit(i)                 // send a value to the collector
    }
}

// Nothing printed yet.
numbers.collect { println(it) }   // Started, 1, 2, 3
numbers.collect { println(it) }   // Started, 1, 2, 3 again: a fresh run''')),
  S('Ways to build a flow', [
    "`flow { emit(x) }` for custom logic. `flowOf(1, 2, 3)` for fixed values. `list.asFlow()` to turn a collection into a flow. `callbackFlow { }` to wrap a listener-based API. Room and DataStore return flows for you."]),
 ],
 mistakes=[('Expecting a flow to start when it is created', 'It starts on `collect`; nothing runs before that.'),
           ('Collecting the same cold network flow in two places', 'Each collector repeats the request; share it with `stateIn` or `shareIn`.'),
           ('Calling `collect` on the main thread outside a coroutine', '`collect` is a suspend function; call it inside a coroutine.')],
 qa=('What is the difference between a cold flow and a hot flow?',
     "A cold flow starts its work only when collected and runs separately for every collector, like playing a recording from the start. A hot flow, such as StateFlow or SharedFlow, is active on its own and every collector sees the values currently being sent, like tuning in to a live radio station.")),

X([S('Operators build a pipeline', [
    "Intermediate operators like `map`, `filter` and `onEach` take a flow and return a new flow. They do not run anything yet. You chain them into a pipeline, and the whole pipeline runs when a terminal operator such as `collect` or `first()` is called."],
    code=('A small pipeline', '''repo.orders()                         // Flow<List<Order>>
    .map { list -> list.filter { it.isPaid } }
    .map { it.sumOf(Order::amount) }
    .distinctUntilChanged()           // only emit when the total changes
    .collect { total -> showTotal(total) }''')),
  S('Combining flows', [
    "`combine(a, b)` emits a new value whenever **either** flow emits, using the latest from both. It is perfect for UI state built from several sources, such as user settings plus data. `zip(a, b)` pairs values one by one and waits for both, so it is used less often."]),
  S('The flatMap family', [
    "Sometimes each value starts a new flow, like each search query starting a new search. `flatMapLatest` cancels the previous search when a new query arrives, so you only get results for the latest text. `flatMapConcat` waits for each inner flow to finish, and `flatMapMerge` runs them all at once."],
    code=('combine for screen state', '''val uiState = combine(repo.profile(), settings.theme(), network.isOnline) { p, theme, online ->
    ProfileUi(name = p.name, dark = theme == Theme.DARK, offline = !online)
}''')),
 ],
 mistakes=[('Using `flatMapMerge` for search', 'Old results can arrive after new ones; use `flatMapLatest`.'),
           ('Doing heavy work in `map` on the main thread', 'Add `.flowOn(Dispatchers.Default)` after the heavy operators.'),
           ('Using `zip` to combine UI sources', 'Use `combine`; zip waits for both and pairs values one-to-one.')],
 qa=('What is the difference between combine and zip?',
     "combine emits whenever any input emits, always using the latest value from each input. zip waits until each input has a new value and pairs them in order, first with first, second with second. For UI state from several sources, combine is almost always the right choice.")),

X([S('StateFlow: a value that can change', [
    "`StateFlow` always holds one current value, which you read with `.value`. New collectors immediately get the current value, then every change after that. If you set the same value again, nothing is sent. This makes it a great fit for screen state."],
    code=('Exposing state from a ViewModel', '''class CounterViewModel : ViewModel() {
    private val _count = MutableStateFlow(0)       // private, can change
    val count: StateFlow<Int> = _count             // public, read-only

    fun increment() = _count.update { it + 1 }     // safe even from many threads
}''')),
  S('SharedFlow: broadcast to everyone', [
    "`SharedFlow` sends values to all current collectors and has no single current value. You choose how many old values new collectors get with `replay`. It suits things many parts of the app listen to, such as \"user logged out\" or \"cart changed\" events."]),
  S('stateIn and shareIn', [
    "A cold flow from a repository can be turned into a hot one with `stateIn` or `shareIn`, so several collectors share one upstream instead of repeating the work. `SharingStarted.WhileSubscribed(5000)` keeps it running while someone is collecting, plus five seconds. That covers screen rotation without restarting the work, but stops it when the user really leaves."],
    code=('Turning a repository flow into state', '''val articles: StateFlow<List<Article>> = repo.articles()
    .stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = emptyList()
    )''')),
 ],
 mistakes=[('Exposing `MutableStateFlow` publicly', 'Expose a read-only `StateFlow` so only the ViewModel changes it.'),
           ('Using StateFlow for one-time events like "show toast"', 'StateFlow keeps the last value; use a Channel or event in state.'),
           ('`_state.value = _state.value.copy(...)` from many coroutines', 'Use `_state.update { }`, which is safe against lost updates.')],
 qa=('Why use WhileSubscribed(5000) in stateIn?',
     "It keeps the upstream flow active only while the UI is collecting, plus a 5-second grace period. During rotation the UI stops collecting for a moment; the grace period means the data is not reloaded. When the user leaves the screen for longer, the upstream stops and saves battery and network.")),

X([S('Why lifecycle-aware collecting matters', [
    "If you collect a flow in `lifecycleScope.launch { }`, it keeps collecting while the app is in the background, because lifecycleScope is only cancelled when the Activity is destroyed. The flow keeps doing work nobody can see, and updating views while stopped can even crash."]),
  S('repeatOnLifecycle and collectAsStateWithLifecycle', [
    "`repeatOnLifecycle(Lifecycle.State.STARTED)` starts collecting when the screen becomes visible and cancels when it is hidden, then starts again next time. In Compose, `collectAsStateWithLifecycle()` does the same thing for you and gives you a `State` to read."],
    code=('Views and Compose', '''// Views
viewLifecycleOwner.lifecycleScope.launch {
    viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
        vm.state.collect { render(it) }
    }
}

// Compose
@Composable
fun OrdersScreen(vm: OrdersViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    OrdersContent(state)
}''')),
  S('flowOn and callbackFlow', [
    "`flowOn(Dispatchers.IO)` moves the work **above** it to another dispatcher, while your `collect` stays where it was. To turn a listener API into a flow, use `callbackFlow { }`: register the listener, send values with `trySend`, and unregister in `awaitClose { }`, which runs when collecting stops."]),
 ],
 mistakes=[('Collecting in `lifecycleScope.launch` without repeatOnLifecycle', 'Wrap the collect in `repeatOnLifecycle(STARTED)`.'),
           ('Using `collectAsState()` for Android UI', 'Prefer `collectAsStateWithLifecycle()` so collection stops in the background.'),
           ('Forgetting `awaitClose` in callbackFlow', 'Always unregister the listener in `awaitClose`.')],
 qa=('What does flowOn change?',
     "flowOn changes the dispatcher used by the operators and the flow builder above it, the upstream. It does not change where collect runs. So you can do heavy mapping on Dispatchers.Default with flowOn and still collect and update the UI on the main thread.")),

X([S('When the producer is faster than the collector', [
    "By default a flow is sequential: after `emit`, the producer waits until the collector has finished with that value. If collecting is slow, the producer slows down too. That is safe, but sometimes you want them to run independently."]),
  S('buffer, conflate and collectLatest', [
    "`buffer()` lets the producer keep emitting into a queue while the collector works. `conflate()` drops values the collector did not get to and keeps only the newest, which is great for things like progress or sensor data. `collectLatest { }` cancels the work for the old value as soon as a new one arrives."],
    code=('Only render the latest progress', '''downloadProgress()                 // emits 0..100 quickly
    .conflate()                    // skip values we are too slow for
    .collect { percent -> progressBar.progress = percent }''')),
  S('Handling errors in a flow', [
    "`catch { }` handles errors from operators **above** it and can emit a fallback value. It does not catch errors thrown inside your `collect` block. `retry(3)` or `retryWhen { }` restarts the flow after an error, and you can add a delay to back off between tries."],
    code=('Retry with backoff, then fallback', '''repo.liveScores()
    .retryWhen { cause, attempt ->
        if (cause is IOException && attempt < 3) { delay(1_000L * (attempt + 1)); true } else false
    }
    .catch { emit(Scores.Unavailable) }
    .collect { render(it) }''')),
 ],
 mistakes=[('Expecting `catch` to handle errors thrown in `collect`', 'Move risky work into `onEach` before `catch`, then call `collect()`.'),
           ('Retrying forever on any error', 'Retry only network errors, a few times, with a delay.'),
           ('Using `buffer` when you only need the latest value', 'Use `conflate` or `collectLatest`.')],
 qa=('What is the difference between conflate and collectLatest?',
     "conflate drops values the collector was too busy to receive, but finishes processing the current value. collectLatest cancels the processing of the current value as soon as a newer one arrives and starts again with the new value. Use collectLatest when processing an old value is pointless, like rendering a search result that is already out of date.")),
]

DEEP['architecture'] = [
X([S('Why architecture matters', [
    "Without structure, screens talk directly to the network, the database and each other. Then one change breaks three places, and nothing can be tested without a phone. Architecture is about **who is allowed to know about whom**, so each part can change and be tested on its own."]),
  S('The recommended layers', [
    "**UI layer**: what the user sees (Activities, Fragments, composables) plus ViewModels that hold screen state. **Data layer**: repositories that decide where data comes from, and data sources that talk to the network, database or files. **Domain layer** (optional): use cases that hold business rules shared by several screens.",
    "Arrows point one way: UI uses domain or data, domain uses data, and data knows nothing about the UI. That one-way rule is what keeps the app easy to change."]),
  S('Unidirectional data flow (UDF)', [
    "State flows **down** from the ViewModel to the UI. Events flow **up** from the UI to the ViewModel. The UI never changes state directly; it asks the ViewModel, which updates state, which the UI then shows. This makes it easy to see why the screen looks the way it does."],
    code=('UDF in one screen', '''@Composable
fun TodoScreen(vm: TodoViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()     // state flows down
    TodoList(
        items = state.items,
        onToggle = { id -> vm.onToggle(id) },               // events flow up
        onAdd = vm::onAdd
    )
}''')),
 ],
 mistakes=[('Calling Retrofit directly from an Activity', 'Go through a ViewModel and a repository.'),
           ('Letting the data layer import UI classes', 'Keep arrows one way; the data layer returns plain models.'),
           ('Adding every layer to a tiny app', 'Start simple; add a domain layer only when logic is shared or complex.')],
 qa=('What is a single source of truth?',
     "It means each piece of data has exactly one owner that is allowed to change it, and everyone else reads from that owner. For screen state, the ViewModel is the owner. For app data, usually the local database is the owner and the network only updates it. This avoids two copies of the same data disagreeing.")),

X([S('What the ViewModel is for', [
    "A ViewModel prepares and keeps the data a screen needs. It survives rotation, so data is not reloaded every time the phone turns. It also gives you `viewModelScope`, which cancels work when the screen is gone for good.",
    "It must not know about views. No `TextView`, no `Activity`, no `Fragment` references. If it held one, the old Activity could never be freed after rotation."]),
  S('How the ViewModel survives rotation', [
    "Each Activity or Fragment has a `ViewModelStore`. When the Activity is recreated for a configuration change, Android keeps the store and hands it to the new Activity, so `by viewModels()` returns the same object. When the Activity finishes for real, the store calls `onCleared()` on each ViewModel and `viewModelScope` is cancelled."],
    code=('One state, small functions', '''data class LoginUi(
    val email: String = "",
    val password: String = "",
    val loading: Boolean = false,
    val error: String? = null
) { val canSubmit get() = email.isNotBlank() && password.length >= 8 && !loading }

class LoginViewModel(private val auth: AuthRepository) : ViewModel() {
    private val _state = MutableStateFlow(LoginUi())
    val state = _state.asStateFlow()

    fun onEmail(v: String) = _state.update { it.copy(email = v, error = null) }
    fun onPassword(v: String) = _state.update { it.copy(password = v, error = null) }

    fun submit() = viewModelScope.launch {
        _state.update { it.copy(loading = true) }
        val ok = auth.login(_state.value.email, _state.value.password)
        _state.update { it.copy(loading = false, error = if (ok) null else "Wrong email or password") }
    }
}''')),
  S('MVVM vs MVP', [
    "In MVP, the Presenter holds a reference to the View and calls methods on it like `view.showLoading()`. That breaks on rotation and needs careful attach and detach. In MVVM, the ViewModel just exposes state and the View observes it, so the ViewModel never needs to know if a View exists."]),
 ],
 mistakes=[('Passing an Activity context into the ViewModel', 'Use `@ApplicationContext` via DI, or move that work elsewhere.'),
           ('Exposing many separate LiveData fields', 'Expose one state object so the UI never sees a half-updated mix.'),
           ('Loading data in the Fragment and storing it in the ViewModel', 'Let the ViewModel load data itself, usually in `init`.')],
 qa=('Why should a ViewModel not hold a reference to a View or Activity?',
     "The ViewModel lives longer than the Activity: it survives rotation while the Activity is destroyed and recreated. If it kept a reference, the old Activity and its whole view tree could not be garbage collected, which is a memory leak, and calls on it could crash. The ViewModel should only expose state that the current View observes.")),

X([S('MVI in plain words', [
    "MVI stands for Model, View, Intent. The user does something (an **intent**, also called an action or event). A **reducer** takes the current state and the event and returns a new state. The **view** draws that state. Everything goes round in one circle."],
    code=('A complete MVI loop', '''sealed interface CartEvent {
    data class Add(val item: Item) : CartEvent
    data class Remove(val id: String) : CartEvent
    data object Clear : CartEvent
}

data class CartState(val items: List<Item> = emptyList()) {
    val total get() = items.sumOf { it.price }
}

fun reduce(state: CartState, event: CartEvent): CartState = when (event) {
    is CartEvent.Add    -> state.copy(items = state.items + event.item)
    is CartEvent.Remove -> state.copy(items = state.items.filterNot { it.id == event.id })
    CartEvent.Clear     -> CartState()
}

class CartViewModel : ViewModel() {
    private val _state = MutableStateFlow(CartState())
    val state = _state.asStateFlow()
    fun on(event: CartEvent) = _state.update { reduce(it, event) }
}''')),
  S('Why teams like it', [
    "The reducer is a plain function with no Android code, so it is easy to test: give it a state and an event and check the result. Because every change goes through one place, you can log every event and replay bugs exactly."]),
  S('Side effects', [
    "Not everything is state. Navigation, showing a snackbar or opening a browser happen once. Keep those as **effects**, sent through a `Channel`, or model them in state and clear them after the UI handles them."]),
 ],
 mistakes=[('Calling the network inside the reducer', 'Keep the reducer pure; do I/O in the ViewModel and send the result as an event.'),
           ('Putting navigation in state without clearing it', 'Use an effect channel, or clear the flag after navigating.'),
           ('Using MVI for a simple static screen', 'MVVM with one state object is enough there.')],
 qa=('What is the main benefit of a pure reducer in MVI?',
     "A pure reducer always gives the same new state for the same old state and event, with no side effects. That makes state changes predictable, easy to unit test without Android, and easy to debug, because you can log and replay the sequence of events that led to any bug.")),

X([S('What a repository does', [
    "A repository is the one place the rest of the app asks for data. It hides the details: whether data came from memory, the database or the network, how it is cached, and how errors are mapped. ViewModels do not care. That also makes it easy to swap the real repository for a fake in tests."]),
  S('Offline-first: the database is the truth', [
    "In an offline-first app, the UI only ever reads from the local database, usually as a Flow. To refresh, the repository fetches from the network and **writes to the database**. The database emits the new rows, and the UI updates on its own. If there is no internet, the user still sees the saved data."],
    code=('Read from DB, refresh from network', '''class NewsRepository(private val dao: NewsDao, private val api: NewsApi) {

    fun news(): Flow<List<News>> = dao.observe().map { it.map(NewsEntity::toModel) }

    suspend fun refresh(): Result<Unit> = runCatching {
        val remote = api.latest()
        dao.replaceAll(remote.map(NewsDto::toEntity))
    }
}

// ViewModel
val news = repo.news().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
init { viewModelScope.launch { repo.refresh() } }''')),
  S('Three kinds of models', [
    "**DTOs** match the JSON from the server. **Entities** match database tables. **Domain models** are what the app actually uses. Small mapping functions convert between them. This seems like extra work, but when the API renames a field, you change one mapper instead of every screen."]),
 ],
 mistakes=[('Showing network data directly and also saving it', 'Show only what comes from the database to avoid two truths.'),
           ('Passing DTOs all the way to the UI', 'Map to domain or UI models at the repository boundary.'),
           ('Throwing raw `HttpException` to the ViewModel', 'Map errors to simple app errors in the repository.')],
 qa=('Why should the UI observe the database instead of the network response?',
     "Because the database then becomes the single source of truth. The UI always shows one consistent copy of the data, it works offline, and any update, whether from a refresh, a background sync or a user edit, automatically reaches every screen that observes it. The network's only job is to keep the database fresh.")),

X([S('Clean Architecture without the jargon', [
    "The idea: keep your business rules (what the app does) separate from details (which database, which network library, which UI toolkit). Business rules sit in the middle and do not import Android classes. Details depend on the middle, never the other way round.",
    "In practice on Android: the domain module has use cases and plain Kotlin models; the data module implements repository interfaces the domain declares; the UI calls use cases or repositories."]),
  S('Use cases', [
    "A use case is a small class that does one thing, like `PlaceOrderUseCase`. It is worth adding when the logic is used in more than one screen, or when it combines several repositories. Naming it with `operator fun invoke` lets you call it like a function."],
    code=('A focused use case', '''class PlaceOrderUseCase @Inject constructor(
    private val cart: CartRepository,
    private val payments: PaymentRepository,
    private val orders: OrderRepository
) {
    suspend operator fun invoke(method: PaymentMethod): Result<OrderId> = runCatching {
        val items = cart.items().first()
        require(items.isNotEmpty()) { "Cart is empty" }
        val paymentId = payments.charge(items.sumOf { it.price }, method)
        orders.create(items, paymentId).also { cart.clear() }
    }
}

// In a ViewModel: placeOrder(PaymentMethod.Upi)''')),
  S('Modules', [
    "Splitting the app into Gradle modules (for example `:core:network`, `:core:database`, `:feature:cart`) makes builds faster, because only changed modules recompile. It also enforces rules: if `:feature:cart` does not depend on `:feature:profile`, it simply cannot call its code. Features talk through shared core modules and navigation routes."]),
 ],
 mistakes=[('Use cases that only call one repository function', 'Call the repository directly until real logic appears.'),
           ('Feature modules depending on each other', 'Share code through core modules; navigate with routes.'),
           ('Putting Android classes in the domain layer', 'Keep domain pure Kotlin so it is easy to test and reuse.')],
 qa=('When would you add a domain layer to an Android app?',
     "When business logic is shared by several ViewModels, when it combines several repositories, or when it is complex enough that it deserves its own tests. For a small app or simple screens, the domain layer just adds files without benefit, so I would start without it and add use cases when duplication or complexity appears.")),
]
