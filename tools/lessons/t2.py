from common import L, A, D

TOPICS = {}

TOPICS['coroutines'] = dict(lessons=[
L('Introduction',
  ["Coroutines are a **lightweight** way to write asynchronous code that reads like sequential code. A `suspend` function can pause without blocking its thread, so thousands of coroutines can share a few threads.",
   "On Android you launch coroutines in a scope tied to a lifecycle, usually `viewModelScope` or `lifecycleScope`, so work is cancelled automatically when the screen goes away."],
  ['Suspend functions', 'Coroutine scope', 'Dispatchers', 'Structured concurrency', 'Cancellation and exceptions'],
  'Launching a coroutine',
  '''class ProfileViewModel(private val repo: ProfileRepository) : ViewModel() {
    fun load() {
        viewModelScope.launch {
            val profile = repo.fetchProfile()   // suspends, does not block Main
            _state.value = ProfileUi.Loaded(profile)
        }
    }
}

class ProfileRepository(private val api: Api) {
    suspend fun fetchProfile(): Profile = withContext(Dispatchers.IO) {
        api.profile()                         // make the network call off Main
    }
}''',
  'Coroutines work great with lifecycle-aware components like ViewModel and lifecycleScope: cancellation comes for free.'),
L('Coroutine basics',
  ["`launch` starts a coroutine that returns a `Job` and is used for fire-and-forget work. `async` returns a `Deferred<T>`, and you call `await()` for the result; use it to run independent work in parallel.",
   "A `suspend` function can only be called from another suspend function or a coroutine. Suspending is cooperative: the function gives up its thread at suspension points such as `delay`, `withContext` or a network call written with suspend."],
  ['launch vs async/await', 'suspend means "can pause", not "runs in background"', 'runBlocking only in tests or main functions', 'Parallel decomposition with async'],
  'Parallel calls with async',
  '''suspend fun loadHome(): Home = coroutineScope {
    val user    = async { api.user() }
    val feed    = async { api.feed() }
    val banners = async { api.banners() }
    Home(user.await(), feed.await(), banners.await())   // ~max of the three, not the sum
}''',
  'A suspend function does not switch threads by itself. Saying "suspend makes it run in the background" is a red flag in interviews.'),
L('Coroutine scopes and dispatchers',
  ["A **scope** owns the coroutines started in it; cancelling the scope cancels all of them. A **dispatcher** decides which thread runs the code: `Main` for UI, `IO` for blocking I/O (a large, elastic pool), `Default` for CPU work (as many threads as cores).",
   "Good practice is **main-safety**: every suspend function in your data layer switches to the right dispatcher itself with `withContext`, so callers can call it from Main. Inject dispatchers so tests can replace them."],
  ['viewModelScope, lifecycleScope, custom CoroutineScope', 'Dispatchers.Main / IO / Default / Main.immediate', 'withContext for switching', 'Inject dispatchers for testing', 'Avoid GlobalScope'],
  'Main-safe repository with an injected dispatcher',
  '''class ImageRepository(
    private val io: CoroutineDispatcher = Dispatchers.IO,
    private val cpu: CoroutineDispatcher = Dispatchers.Default
) {
    suspend fun thumbnail(file: File): Bitmap {
        val bytes = withContext(io) { file.readBytes() }          // blocking disk read
        return withContext(cpu) { decodeAndScale(bytes, 200) }    // CPU-heavy decode
    }
}''',
  'GlobalScope work is not tied to any lifecycle and leaks easily. If something must outlive a screen, use an application-level scope you control, or WorkManager.'),
L('Structured concurrency and cancellation',
  ["Coroutines form a tree: a parent waits for its children, and cancelling a parent cancels its children. That is **structured concurrency**, and it prevents leaked work.",
   "Cancellation is **cooperative**. Suspending functions from kotlinx check for it automatically, but a tight CPU loop must call `ensureActive()` or `yield()`. Never swallow `CancellationException` in a catch-all, or cancelled work keeps running."],
  ['Parent-child job tree', 'coroutineScope vs supervisorScope', 'ensureActive / isActive / yield', 'withTimeout and NonCancellable for cleanup', 'Rethrow CancellationException'],
  'Cancellation-safe work',
  '''suspend fun compress(files: List<File>) = withContext(Dispatchers.Default) {
    for (f in files) {
        ensureActive()                       // stop promptly if the scope is cancelled
        compressOne(f)
    }
}

try {
    upload()
} catch (e: CancellationException) {
    throw e                                  // never swallow cancellation
} catch (e: IOException) {
    showRetry()
}''',
  'runCatching { } also catches CancellationException. Mention this subtle trap if the interviewer asks about error handling.'),
L('Error handling',
  ["An uncaught exception in a child of a regular `Job` cancels the parent and all siblings. With a `SupervisorJob` (or `supervisorScope`), a failing child does not affect its siblings. `viewModelScope` uses a SupervisorJob.",
   "`launch` propagates exceptions to its parent immediately; `async` holds them until `await()`. A `CoroutineExceptionHandler` is a last resort for logging and only works on root coroutines, not to recover."],
  ['Job vs SupervisorJob', 'launch vs async exception behaviour', 'CoroutineExceptionHandler on root coroutines only', 'try/catch around the suspend call itself'],
  'Independent children with supervisorScope',
  '''suspend fun syncAll() = supervisorScope {
    val a = launch { syncContacts() }        // if this fails...
    val b = launch { syncPhotos() }          // ...this keeps running
}

val handler = CoroutineExceptionHandler { _, e -> crashReporter.log(e) }
appScope.launch(handler) { refreshConfig() }''',
  'Classic question: "a SupervisorJob is the parent of two children and one throws. What happens?" Only that child fails; the sibling and parent continue.'),
L('Testing coroutines',
  ["Use `runTest` from kotlinx-coroutines-test. It skips `delay`s with virtual time so tests run instantly. Replace `Dispatchers.Main` with a test dispatcher via `Dispatchers.setMain` in a JUnit rule.",
   "Pass a `StandardTestDispatcher` or `UnconfinedTestDispatcher` into classes that take a dispatcher, and use `advanceUntilIdle()` to run pending work."],
  ['runTest and virtual time', 'Dispatchers.setMain / resetMain', 'StandardTestDispatcher vs UnconfinedTestDispatcher', 'Turbine for Flow assertions'],
  'A ViewModel test',
  '''@get:Rule val main = MainDispatcherRule()   // calls Dispatchers.setMain(testDispatcher)

@Test fun `loads profile`() = runTest {
    val vm = ProfileViewModel(FakeRepo(profile = sample))
    vm.load()
    advanceUntilIdle()
    assertEquals(ProfileUi.Loaded(sample), vm.state.value)
}''',
  'Injecting dispatchers is what makes this test possible. Tie testability back to the design decision.'),
], articles=[
A('Coroutines basics', 'https://kotlinlang.org/docs/coroutines-basics.html'),
A('Coroutine context and dispatchers', 'https://kotlinlang.org/docs/coroutine-context-and-dispatchers.html'),
A('Cancellation and timeouts', 'https://kotlinlang.org/docs/cancellation-and-timeouts.html'),
A('Coroutine exception handling', 'https://kotlinlang.org/docs/exception-handling.html'),
A('Best practices for coroutines in Android', 'https://developer.android.com/kotlin/coroutines/coroutines-best-practices'),
D('Coroutines and Flow', '/concept_coroutines'),
D('Coroutines lifecycle explained', '/explainer_coroutines'),
])

TOPICS['flows'] = dict(lessons=[
L('Introduction',
  ["A `Flow` is an asynchronous stream of values. Most flows are **cold**: nothing runs until someone collects, and each collector gets its own run.",
   "`StateFlow` and `SharedFlow` are **hot**: they exist independently of collectors. StateFlow always has a current value (great for UI state); SharedFlow broadcasts events to any number of subscribers."],
  ['Cold vs hot streams', 'Builders: flow { }, flowOf, asFlow, callbackFlow', 'Intermediate vs terminal operators', 'StateFlow vs SharedFlow vs LiveData'],
  'A cold flow',
  '''fun ticker(periodMs: Long): Flow<Int> = flow {
    var i = 0
    while (true) {
        emit(i++)            // suspends until the collector is ready
        delay(periodMs)
    }
}

// Nothing runs until here, and it stops when the collecting scope is cancelled
lifecycleScope.launch { ticker(1000).take(5).collect { println(it) } }''',
  'Explain cold vs hot with a cassette tape (each listener starts from the beginning) and a radio station (you hear whatever is on now).'),
L('Operators',
  ["Intermediate operators (`map`, `filter`, `onEach`, `debounce`, `distinctUntilChanged`) build a new flow and run nothing. Terminal operators (`collect`, `first`, `toList`, `launchIn`) start it.",
   "The `flatMap` family differs in concurrency: `flatMapLatest` cancels the previous inner flow when a new value arrives (perfect for search), `flatMapConcat` runs them one after another, and `flatMapMerge` runs them concurrently. `combine` emits when either input changes; `zip` pairs values one-to-one."],
  ['map / filter / transform', 'debounce and distinctUntilChanged', 'flatMapLatest vs flatMapConcat vs flatMapMerge', 'combine vs zip', 'catch and retry'],
  'Search-as-you-type',
  '''val results: StateFlow<List<Item>> = queryFlow
    .map { it.trim() }
    .debounce(300)
    .distinctUntilChanged()
    .flatMapLatest { q ->
        if (q.length < 2) flowOf(emptyList())
        else repo.search(q).catch { emit(emptyList()) }
    }
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())''',
  'This one snippet answers half the Flow interview: debounce, flatMapLatest, error handling and stateIn.'),
L('StateFlow and SharedFlow',
  ["`StateFlow` holds one value, needs an initial value, replays the latest value to new collectors, and **conflates**: equal consecutive values are dropped and slow collectors see only the latest. Use it for UI state.",
   "`SharedFlow` is configurable (`replay`, `extraBufferCapacity`, `onBufferOverflow`) and has no current value. For one-off UI events, a `Channel` received as a flow guarantees each event is handled once, even while no one is collecting."],
  ['StateFlow = state, conflated, has value', 'SharedFlow = broadcast, configurable replay', 'Channel for one-time events', 'stateIn / shareIn and SharingStarted.WhileSubscribed(5000)'],
  'State plus one-off events in a ViewModel',
  '''class PayViewModel : ViewModel() {
    private val _state = MutableStateFlow(PayUi())
    val state: StateFlow<PayUi> = _state.asStateFlow()

    private val _events = Channel<PayEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    fun pay() = viewModelScope.launch {
        _state.update { it.copy(loading = true) }
        val ok = repo.pay()
        _state.update { it.copy(loading = false) }
        _events.send(if (ok) PayEvent.Success else PayEvent.ShowError)
    }
}''',
  'WhileSubscribed(5000) keeps the upstream alive for 5 seconds, so a rotation does not restart the work. Explain why that number is used.'),
L('Collecting safely on Android',
  ["Collecting in `lifecycleScope.launch { }` alone keeps collecting while the app is in the background, wasting resources and possibly crashing on UI updates. Use `repeatOnLifecycle(STARTED)` in Views, or `collectAsStateWithLifecycle()` in Compose.",
   "`flowOn` changes the dispatcher of the **upstream** only; the collector keeps its own context. Never use `withContext` inside `flow { }` to emit from a different context; that breaks context preservation and throws."],
  ['repeatOnLifecycle(STARTED)', 'collectAsStateWithLifecycle in Compose', 'flowOn affects upstream only', 'callbackFlow + awaitClose for listener APIs'],
  'Wrapping a callback API',
  '''fun LocationClient.updates(): Flow<Location> = callbackFlow {
    val cb = object : LocationCallback() {
        override fun onLocationResult(r: LocationResult) {
            r.lastLocation?.let { trySend(it) }
        }
    }
    requestUpdates(cb)
    awaitClose { removeUpdates(cb) }   // runs when the collector cancels
}.flowOn(Dispatchers.Default)''',
  'Forgetting awaitClose in callbackFlow leaks the listener. It is a favourite follow-up question.'),
L('Backpressure, errors and testing',
  ["Flows are sequential by default: the producer suspends until the collector finishes each value. `buffer()` runs producer and collector concurrently, `conflate()` drops intermediate values, and `collectLatest` cancels slow handling when a new value arrives.",
   "`catch` handles upstream errors only; exceptions thrown in `collect` are not caught by it. Test flows with **Turbine**: `flow.test { assertEquals(x, awaitItem()) }`."],
  ['buffer, conflate, collectLatest', 'catch is upstream-only', 'retry / retryWhen with backoff', 'Testing with Turbine'],
  'Testing a flow with Turbine',
  '''@Test fun `emits loading then data`() = runTest {
    vm.state.test {
        assertEquals(Ui.Idle, awaitItem())
        vm.load()
        assertEquals(Ui.Loading, awaitItem())
        assertEquals(Ui.Data(sample), awaitItem())
        cancelAndIgnoreRemainingEvents()
    }
}''',
  'Because StateFlow conflates, a fast Loading → Data change may skip Loading in tests. Know this before an interviewer asks why your test is flaky.'),
], articles=[
A('Asynchronous Flow', 'https://kotlinlang.org/docs/flow.html'),
A('Kotlin flows on Android', 'https://developer.android.com/kotlin/flow'),
A('StateFlow and SharedFlow', 'https://developer.android.com/kotlin/flow/stateflow-and-sharedflow'),
A('Use Kotlin coroutines with lifecycle-aware components', 'https://developer.android.com/topic/libraries/architecture/coroutines'),
D('Flow vs LiveData explained', '/explainer_flow'),
D('Coroutines and Flow', '/concept_coroutines'),
])

TOPICS['architecture'] = dict(lessons=[
L('Introduction',
  ["Good architecture keeps code easy to change and test. Android's recommended app architecture has a **UI layer** (screens and ViewModels), a **data layer** (repositories and data sources) and an optional **domain layer** (use cases).",
   "Two rules make it work: **separation of concerns** (each class has one job) and **unidirectional data flow** (state flows down, events flow up)."],
  ['UI layer, domain layer, data layer', 'Single source of truth', 'Unidirectional data flow', 'Dependencies point inward'],
  'The layers in one flow',
  '''// UI layer
class OrdersViewModel(private val getOrders: GetRecentOrdersUseCase) : ViewModel() {
    val state = getOrders().map(OrdersUi::Loaded)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), OrdersUi.Loading)
}

// Domain layer (optional)
class GetRecentOrdersUseCase(private val repo: OrdersRepository) {
    operator fun invoke() = repo.orders().map { it.sortedByDescending(Order::date).take(20) }
}

// Data layer
interface OrdersRepository { fun orders(): Flow<List<Order>> }''',
  'Start any architecture answer with the data flow, then the layers. Name the trade-off: more layers mean more files for small apps.'),
L('MVVM and the ViewModel',
  ["The ViewModel holds and exposes UI state, survives configuration changes and outlives the View. It must **never** hold a reference to a View, Activity or Fragment context, or it will leak them.",
   "Expose one immutable state object (`StateFlow<ScreenUi>`) instead of many separate LiveData fields. That avoids inconsistent combinations, such as loading and error showing at the same time."],
  ['ViewModel scope and lifetime', 'One state object per screen', 'No Context or View references (use AndroidViewModel only if needed)', 'SavedStateHandle for process death'],
  'A single UI state',
  '''data class CartUi(
    val items: List<CartItemUi> = emptyList(),
    val total: String = "",
    val isLoading: Boolean = false,
    val error: String? = null
)

class CartViewModel(private val repo: CartRepository) : ViewModel() {
    private val _state = MutableStateFlow(CartUi(isLoading = true))
    val state = _state.asStateFlow()

    fun remove(id: String) = viewModelScope.launch {
        runCatching { repo.remove(id) }
            .onFailure { e -> _state.update { it.copy(error = e.message) } }
    }
}''',
  'If asked "MVVM vs MVP", say MVVM\'s ViewModel does not know the View, so it survives rotation and is easier to test.'),
L('MVI and unidirectional data flow',
  ["MVI models every user action as an **intent** (event), processes it with a reducer `(state, event) -> state`, and renders one immutable state. The flow is strictly one way, which makes behaviour predictable and easy to replay and debug.",
   "The cost is boilerplate and the need to handle one-off effects (navigation, toasts) separately from state."],
  ['Intent → reducer → state → render', 'Pure reducers are easy to unit test', 'Side effects separate from state', 'When MVI is overkill'],
  'A minimal reducer',
  '''sealed interface LoginEvent {
    data class EmailChanged(val v: String) : LoginEvent
    data object Submit : LoginEvent
}

fun reduce(s: LoginUi, e: LoginEvent): LoginUi = when (e) {
    is LoginEvent.EmailChanged -> s.copy(email = e.v, error = null)
    LoginEvent.Submit -> if ('@' in s.email) s.copy(loading = true)
                         else s.copy(error = "Enter a valid email")
}''',
  'Interviewers like a balanced view: MVI shines on complex screens with many interacting inputs, MVVM is enough for simple ones.'),
L('Repository, single source of truth and offline-first',
  ["A repository hides where data comes from. The usual pattern is that the **database is the single source of truth**: the UI observes Room, and the network only refreshes the database. That gives offline support and consistency for free.",
   "Map network models (DTOs) and database entities to domain models at the boundary, so API changes do not ripple through the app."],
  ['Repository as the only entry point to data', 'Database as single source of truth', 'DTO → entity → domain mapping', 'Stale-while-revalidate refresh'],
  'Offline-first repository',
  '''class ArticlesRepository(private val dao: ArticleDao, private val api: NewsApi) {
    fun articles(): Flow<List<Article>> =
        dao.observeAll().map { rows -> rows.map(ArticleEntity::toDomain) }

    suspend fun refresh() {
        val fresh = api.latest()                           // DTOs
        dao.upsertAll(fresh.map(ArticleDto::toEntity))     // UI updates via the Flow
    }
}''',
  'Say "the UI never reads the network directly" when describing offline-first. It is the core idea in one line.'),
L('Clean Architecture and modularisation',
  ["Clean Architecture puts business rules in the centre (domain), with no Android dependencies, and frameworks at the edges. Dependencies point inward, and outer layers implement interfaces the inner layers define.",
   "Splitting a large app into Gradle modules (`:core:data`, `:feature:checkout`) speeds up builds, enforces boundaries and lets teams work independently. Feature modules should depend on core modules, not on each other."],
  ['Dependency rule: point inward', 'Use cases for reusable business logic', 'Feature vs core modules', 'api vs implementation dependencies', 'Avoid circular module dependencies'],
  'A typical module graph',
  '''// settings.gradle.kts
include(":app")
include(":core:model", ":core:data", ":core:network", ":core:ui")
include(":feature:home", ":feature:checkout")

// feature/checkout/build.gradle.kts
dependencies {
    implementation(project(":core:data"))
    implementation(project(":core:ui"))
    // no dependency on :feature:home — navigate through routes instead
}''',
  'Do not claim Clean Architecture is always right. Mention you would add a domain layer only when logic is shared or complex.'),
], articles=[
A('Guide to app architecture', 'https://developer.android.com/topic/architecture'),
A('UI layer', 'https://developer.android.com/topic/architecture/ui-layer'),
A('Data layer', 'https://developer.android.com/topic/architecture/data-layer'),
A('Domain layer', 'https://developer.android.com/topic/architecture/domain-layer'),
A('Guide to Android app modularization', 'https://developer.android.com/topic/modularization'),
D('MVVM architecture', '/concept_mvvm'),
])
