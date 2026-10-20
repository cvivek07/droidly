from common import L, A, D

TOPICS = {}

TOPICS['android'] = dict(lessons=[
L('Introduction',
  ["An Android app is not one long-running program. The system starts and stops its **components** (Activities, Services, BroadcastReceivers and ContentProviders) whenever it needs to, and it can kill your whole process at any time to free memory.",
   "Interviewers test whether you design for this: state that survives rotation and process death, work that keeps going when the screen goes away, and no leaks of a dead `Context`."],
  ['The four app components and what each is for', 'The system, not you, owns the lifecycle', 'Process death is normal, not an edge case', 'Context: Application vs Activity'],
  'The four components in the manifest',
  '''<application android:name=".App">
    <activity android:name=".MainActivity" android:exported="true">
        <intent-filter>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LAUNCHER" />
        </intent-filter>
    </activity>
    <service android:name=".PlayerService" android:foregroundServiceType="mediaPlayback" />
    <receiver android:name=".BootReceiver" android:exported="false" />
    <provider android:name=".FilesProvider" android:authorities="io.app.files" />
</application>''',
  'When asked "what happens when the user rotates the phone?", answer in three parts: the Activity is destroyed and recreated, ViewModel survives, and savedInstanceState covers process death.', lang='xml'),
L('Activity lifecycle',
  ["An Activity moves through `onCreate` → `onStart` → `onResume` when it comes to the front, and `onPause` → `onStop` → `onDestroy` as it leaves. **Started** means visible, **resumed** means it has focus and takes input.",
   "A configuration change (rotation, dark mode, language) destroys and recreates the Activity. Pressing Home only stops it. The process can then be killed while stopped, and the user returns to a fresh Activity that receives the saved `Bundle`."],
  ['onCreate: inflate UI, restore state, set up observers', 'onStart/onStop: visible or not; start and stop UI work here', 'onResume/onPause: foreground focus; keep it fast', 'isChangingConfigurations tells rotation apart from finishing', 'onSaveInstanceState runs before the Activity may be killed'],
  'Lifecycle-aware collection instead of manual start and stop',
  '''class ProfileActivity : AppCompatActivity() {
    private val vm: ProfileViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_profile)

        lifecycleScope.launch {
            // Collects only while STARTED; stops in onStop, restarts in onStart
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                vm.uiState.collect(::render)
            }
        }
    }
}''',
  'Know the order when Activity A starts Activity B: A.onPause → B.onCreate → B.onStart → B.onResume → A.onStop. It is a very common trick question.'),
L('Fragments and their two lifecycles',
  ["A Fragment has its own lifecycle **and** a separate view lifecycle. On the back stack, the Fragment object stays alive while its view is destroyed (`onDestroyView`) and later recreated.",
   "That is why you observe with `viewLifecycleOwner` and clear the view binding in `onDestroyView`. Otherwise you leak a whole view tree, or receive duplicate observers each time the view comes back."],
  ['Fragment lifecycle vs viewLifecycleOwner', 'Clear binding in onDestroyView', 'Communicate through a shared ViewModel or the Fragment Result API, not direct references', 'FragmentManager back stack and commit vs commitNow'],
  'Safe view binding in a Fragment',
  '''class FeedFragment : Fragment(R.layout.fragment_feed) {
    private var _binding: FragmentFeedBinding? = null
    private val binding get() = _binding!!
    private val vm: FeedViewModel by viewModels()

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        _binding = FragmentFeedBinding.bind(view)
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                vm.items.collect { binding.list.adapter = FeedAdapter(it) }
            }
        }
    }

    override fun onDestroyView() {
        _binding = null   // the Fragment outlives its view on the back stack
        super.onDestroyView()
    }
}''',
  'If an interviewer asks about a memory leak in a Fragment, the binding held past onDestroyView is the first thing to mention.'),
L('Intents, tasks and launch modes',
  ["An **explicit** Intent names the component to start; an **implicit** Intent describes an action (`ACTION_VIEW`, `ACTION_SEND`) and the system finds an app that matches an intent filter. Since Android 12, any component with an intent filter must declare `android:exported`.",
   "Activities live in **tasks** (back stacks). Launch modes and flags such as `singleTop`, `singleTask` and `FLAG_ACTIVITY_CLEAR_TOP` control whether a new instance is created or an existing one receives `onNewIntent`."],
  ['Explicit vs implicit Intents', 'PendingIntent lets another app (e.g. notifications) start your component; choose FLAG_IMMUTABLE by default', 'standard / singleTop / singleTask / singleInstance', 'Deep links and App Links'],
  'Handling a deep link that may arrive twice',
  '''class ArticleActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handle(intent)
    }

    // Called instead of onCreate when launchMode="singleTop" and we are already on top
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handle(intent)
    }

    private fun handle(intent: Intent) {
        val id = intent.data?.lastPathSegment ?: return
        vm.open(id)
    }
}''',
  'Mention that PendingIntents should be FLAG_IMMUTABLE unless something must fill in extras; it is a security question disguised as an API question.'),
L('Services, background work and process death',
  ["A **foreground service** shows a notification and is for work the user is aware of right now: music, navigation, an active call. Modern Android heavily restricts background services, so deferrable work belongs in **WorkManager**, which survives reboots and respects battery constraints.",
   "For UI state, use **ViewModel** for rotation and **SavedStateHandle** (backed by the saved Bundle) for process death. Keep only small, essential state there, such as IDs and scroll position, not whole lists."],
  ['Foreground service vs WorkManager vs coroutine in a ViewModel', 'Process death: how to test it ("Don\'t keep activities", or adb shell am kill)', 'SavedStateHandle for small, restorable state', 'BroadcastReceivers: keep onReceive short'],
  'Surviving process death with SavedStateHandle',
  '''class SearchViewModel(
    private val handle: SavedStateHandle,
    private val repo: SearchRepository
) : ViewModel() {
    // Restored automatically after process death
    val query: StateFlow<String> = handle.getStateFlow("query", "")

    val results = query
        .debounce(300)
        .flatMapLatest { repo.search(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun onQuery(q: String) { handle["query"] = q }
}''',
  'Ask yourself "what if the process dies here?" out loud during design questions. It signals real production experience.'),
], articles=[
A('The activity lifecycle', 'https://developer.android.com/guide/components/activities/activity-lifecycle'),
A('Fragment lifecycle', 'https://developer.android.com/guide/fragments/lifecycle'),
A('Intents and intent filters', 'https://developer.android.com/guide/components/intents-filters'),
A('Save UI states', 'https://developer.android.com/topic/libraries/architecture/saving-states'),
A('Tasks and the back stack', 'https://developer.android.com/guide/components/activities/tasks-and-back-stack'),
D('Core Android fundamentals', '/concept_android_fundamentals'),
D('WorkManager, JobScheduler and AlarmManager', '/concept_workmanager'),
])

TOPICS['kotlin'] = dict(lessons=[
L('Introduction',
  ["Kotlin interviews rarely ask you to recite syntax. They check whether you use the type system to make bugs impossible: nullability, immutable data, exhaustive `when`, and small functions that compose.",
   "Expect questions that compare features (`val` vs `const`, `data` vs regular class, `let` vs `apply`) and \"what does this compile to\" questions about `inline`, `object` and extension functions."],
  ['Null safety and smart casts', 'Data, sealed and value classes', 'Scope functions', 'Higher-order and inline functions', 'Generics and variance'],
  'Idiomatic Kotlin in a few lines',
  '''data class User(val id: String, val name: String, val email: String?)

fun greeting(user: User?): String =
    user?.email
        ?.takeIf { it.isNotBlank() }
        ?.let { "Mail sent to $it" }
        ?: "Hello, ${user?.name ?: "guest"}"''',
  'Write answers in idiomatic Kotlin even on a whiteboard: expression bodies, immutable vals and the elvis operator read as fluency.'),
L('Null safety',
  ["Every type is either nullable (`String?`) or not (`String`), and the compiler forces you to handle null before use. Use `?.` for safe calls, `?:` for a default, and smart casts after a null check.",
   "`!!` throws a NullPointerException and should be rare. `lateinit` is for non-null properties set after construction (e.g. by DI); `by lazy` computes once on first access and is thread-safe by default."],
  ['?. safe call, ?: elvis, !! not-null assertion', 'Smart casts after checks (only on stable values)', 'lateinit vs by lazy', 'Platform types from Java (String!)'],
  'lateinit vs lazy',
  '''class CheckoutActivity : AppCompatActivity() {
    @Inject lateinit var analytics: Analytics          // set by Hilt before onCreate body

    private val formatter by lazy {                     // created once, on first use
        NumberFormat.getCurrencyInstance(Locale("en", "IN"))
    }

    fun price(p: Double?) = p?.let(formatter::format) ?: "—"
}''',
  'Platform types from Java are the hidden source of NPEs in Kotlin code. Mention annotating Java APIs with @Nullable/@NonNull.'),
L('Data, sealed and value classes',
  ["A **data class** generates `equals`, `hashCode`, `toString`, `copy` and `componentN` from the primary constructor. Only primary-constructor properties take part in equality.",
   "A **sealed** class or interface restricts its subclasses to the same module and package, so `when` can be exhaustive with no `else`. That makes it perfect for UI state and results. A **value class** wraps one value with no allocation at runtime, giving type safety for IDs."],
  ['copy() for immutable updates', 'Sealed hierarchies for state and events', 'Exhaustive when as an expression', '@JvmInline value class for type-safe IDs', 'object for singletons, data object for sealed leaves'],
  'Modelling screen state',
  '''@JvmInline value class OrderId(val raw: String)

sealed interface OrderUi {
    data object Loading : OrderUi
    data class Loaded(val id: OrderId, val items: List<Item>) : OrderUi
    data class Error(val message: String, val canRetry: Boolean) : OrderUi
}

fun render(state: OrderUi) = when (state) {     // no else needed: compiler checks all cases
    OrderUi.Loading   -> showSpinner()
    is OrderUi.Loaded -> showItems(state.items)
    is OrderUi.Error  -> showError(state.message, state.canRetry)
}''',
  'When you add a new state, an exhaustive when turns a runtime bug into a compile error. Say exactly that in the interview.'),
L('Scope functions and extensions',
  ["`let`, `run`, `with`, `apply` and `also` differ in two ways: how they refer to the object (`it` or `this`) and what they return (the lambda result or the object itself).",
   "Extension functions add functions to a type without inheritance. They are resolved **statically** from the declared type, so they cannot be overridden and cannot access private members."],
  ['apply: configure an object, returns it', 'also: side effect (logging), returns it', 'let: transform or null-check, returns result', 'run / with: compute with this, returns result', 'Extensions are static dispatch'],
  'Choosing the right scope function',
  '''val request = Request.Builder().apply {      // configure, returns the builder
    url(endpoint)
    header("Authorization", "Bearer $token")
}.build()

val user = repo.find(id)
    ?.also { log("found ${it.id}") }         // side effect, keeps the value
    ?.let { it.copy(name = it.name.trim()) } // transform

fun View.show(visible: Boolean) { isVisible = visible }   // extension''',
  'Overusing nested scope functions hurts readability. Interviewers like hearing "I keep them one level deep."'),
L('Higher-order functions, inline and generics',
  ["A lambda passed to a normal function is compiled to an object. `inline` copies the function body and the lambda into the call site, avoiding that allocation and allowing non-local `return`. Use `noinline` and `crossinline` when a lambda is stored or called from another context.",
   "`reified` type parameters (only in inline functions) keep the type at runtime. Variance: `out T` means a producer (`List<out T>`), `in T` means a consumer (`Comparator<in T>`)."],
  ['inline, noinline, crossinline', 'reified type parameters', 'Covariance (out) and contravariance (in)', 'Star projection List<*>', 'Function types and SAM conversion'],
  'reified and variance in practice',
  '''inline fun <reified T> Gson.fromJson(json: String): T =
    fromJson(json, object : TypeToken<T>() {}.type)

interface Source<out T> { fun next(): T }          // only produces T
interface Sink<in T> { fun put(item: T) }          // only consumes T

fun copy(from: Source<Number>, to: Sink<Int>) { /* ... */ }

val users: List<User> = gson.fromJson(json)        // no Class token needed''',
  'Remember PECS from Java: Producer Extends, Consumer Super. In Kotlin that is out and in.'),
], articles=[
A('Null safety', 'https://kotlinlang.org/docs/null-safety.html'),
A('Sealed classes and interfaces', 'https://kotlinlang.org/docs/sealed-classes.html'),
A('Scope functions', 'https://kotlinlang.org/docs/scope-functions.html'),
A('Inline functions', 'https://kotlinlang.org/docs/inline-functions.html'),
A('Generics: in, out, where', 'https://kotlinlang.org/docs/generics.html'),
D('Kotlin interview topics', '/concept_kotlin'),
])

TOPICS['compose'] = dict(lessons=[
L('Introduction',
  ["In Compose you describe UI as a function of state: `UI = f(state)`. When state changes, Compose re-runs (**recomposes**) only the functions that read that state, and skips the rest when their inputs are unchanged.",
   "Interview questions centre on three ideas: where state lives (hoisting), what triggers recomposition, and how to run side effects safely from a function that can run many times."],
  ['Composables are idempotent and side-effect free', 'Recomposition can be frequent, out of order, and skipped', 'State hoisting: state down, events up', 'Modifiers and their order'],
  'A stateless, hoisted composable',
  '''@Composable
fun Counter(count: Int, onIncrement: () -> Unit, modifier: Modifier = Modifier) {
    Row(modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("Count: $count")
        Spacer(Modifier.width(12.dp))
        Button(onClick = onIncrement) { Text("+1") }
    }
}

@Composable
fun CounterScreen(vm: CounterViewModel = viewModel()) {
    val count by vm.count.collectAsStateWithLifecycle()
    Counter(count = count, onIncrement = vm::increment)
}''',
  'A stateless composable plus a thin stateful wrapper is the pattern interviewers want to see. It is easy to preview and test.'),
L('State, remember and hoisting',
  ["`mutableStateOf` creates observable state; `remember` keeps it across recompositions; `rememberSaveable` also keeps it across rotation and process death. Without `remember`, state resets on every recomposition.",
   "Hoist state to the lowest common parent that needs it. Screen-level state belongs in a ViewModel exposed as `StateFlow`, collected with `collectAsStateWithLifecycle`."],
  ['remember vs rememberSaveable', 'derivedStateOf to limit recomposition from fast-changing state', 'Single source of truth', 'Immutable state objects; avoid mutable collections in state'],
  'derivedStateOf for a scroll-dependent button',
  '''@Composable
fun MessageList(messages: List<Message>) {
    val listState = rememberLazyListState()
    // Recomposes only when the boolean flips, not on every scroll pixel
    val showJump by remember {
        derivedStateOf { listState.firstVisibleItemIndex > 3 }
    }
    Box {
        LazyColumn(state = listState) {
            items(messages, key = { it.id }) { MessageRow(it) }
        }
        if (showJump) JumpToBottom(Modifier.align(Alignment.BottomEnd))
    }
}''',
  'Always pass key = { it.id } to lazy lists. It keeps item state stable when the list reorders, and interviewers notice when it is missing.'),
L('Recomposition and stability',
  ["Compose can **skip** a composable when all its parameters are stable and equal to last time. Primitive types, `String`, function types and classes annotated `@Immutable` or `@Stable` are stable; a `List` interface or a class with `var`s may not be.",
   "Lambdas that capture unstable values, reading state too high in the tree, and creating new objects during composition all cause extra recompositions. Strong skipping mode (default in newer Compose compilers) relaxes some of these rules."],
  ['Stable vs unstable parameters', 'Read state as late as possible (lambda modifiers like offset { })', 'Layout Inspector recomposition counts', 'Compose compiler reports'],
  'Deferring a state read to the layout phase',
  '''// Bad: reading scroll in composition recomposes Header on every pixel
Header(Modifier.offset(y = -scroll.value.dp))

// Good: the lambda is read during layout only, no recomposition
Header(Modifier.offset { IntOffset(0, -scroll.value) })

@Immutable
data class ProductUi(val id: String, val title: String, val price: String)''',
  'Explain the three phases, composition → layout → drawing, and say a state read in a later phase skips the earlier ones.'),
L('Side effects',
  ["Composable functions must not perform side effects directly, because they can run any number of times. Use effect handlers. `LaunchedEffect(key)` runs a coroutine when it enters composition and restarts when the key changes. `DisposableEffect` adds cleanup. `SideEffect` publishes to non-Compose code after each successful recomposition.",
   "`rememberCoroutineScope` gives a scope for event handlers like a button click. `rememberUpdatedState` lets a long-running effect see the latest value without restarting."],
  ['LaunchedEffect and its keys', 'DisposableEffect with onDispose', 'rememberCoroutineScope for clicks', 'rememberUpdatedState', 'produceState and snapshotFlow'],
  'One-time events and lifecycle cleanup',
  '''@Composable
fun CheckoutScreen(vm: CheckoutViewModel, onDone: () -> Unit) {
    val latestOnDone by rememberUpdatedState(onDone)

    LaunchedEffect(Unit) {
        vm.events.collect { if (it is CheckoutEvent.Paid) latestOnDone() }
    }

    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_STOP) vm.pause() }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }
}''',
  'LaunchedEffect(Unit) means "once per entering composition", not "once ever". It runs again after the composable leaves and comes back.'),
L('Lists, navigation and performance',
  ["`LazyColumn` composes only visible items. Give items stable `key`s and a `contentType` so slots can be reused. Avoid heavy work inside item lambdas; precompute in the ViewModel.",
   "For release performance, use **Baseline Profiles** (Compose is a library, so the first run is interpreted without them), keep R8 enabled, and always measure in a release build. Debug builds are much slower and give misleading results."],
  ['key and contentType in lazy lists', 'Precompute display strings in the ViewModel', 'Baseline Profiles and release builds', 'Navigation: pass IDs, not objects'],
  'An efficient lazy list',
  '''LazyColumn {
    items(
        items = feed,
        key = { it.id },
        contentType = { it.type }          // reuse compositions per row type
    ) { item ->
        when (item) {
            is FeedItem.Post -> PostRow(item)
            is FeedItem.Ad   -> AdRow(item)
        }
    }
}''',
  '"I measured in a release build with a Baseline Profile" is the sentence that separates real Compose performance work from guesswork.'),
], articles=[
A('Thinking in Compose', 'https://developer.android.com/develop/ui/compose/mental-model'),
A('State and Jetpack Compose', 'https://developer.android.com/develop/ui/compose/state'),
A('Side-effects in Compose', 'https://developer.android.com/develop/ui/compose/side-effects'),
A('Lifecycle of composables', 'https://developer.android.com/develop/ui/compose/lifecycle'),
A('Compose performance', 'https://developer.android.com/develop/ui/compose/performance'),
D('Jetpack Compose', '/concept_compose'),
D('Recomposition explained', '/explainer_recomposition'),
])
