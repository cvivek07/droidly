from common import X, S

DEEP = {}

DEEP['android'] = [
X([S('How Android runs your app', [
    "Every app runs in its own Linux process with its own instance of the Android Runtime (ART). The process is forked from **Zygote**, a pre-warmed process that already has the framework classes loaded, which is why apps start faster than a plain JVM would.",
    "Your code never calls `main()`. The system talks to your process through **Binder** (Android's inter-process communication) and tells the `ActivityThread` to create components. Every lifecycle callback you write is the system calling into your code on the **main thread**, which runs a `Looper` that processes one message at a time.",
    "That single main thread draws the UI, handles input and runs lifecycle callbacks. If you block it for about 5 seconds while handling input, the system shows an **ANR** (Application Not Responding) dialog."]),
  S('Process priority and why your app gets killed', [
    "Android ranks processes by importance: **foreground** (visible Activity the user is using, or a foreground service), **visible**, **service**, and **cached** (nothing visible). When memory runs low, the low-memory killer removes cached processes first.",
    "Your app is killed silently with no `onDestroy` call. When the user returns, Android recreates the Activity and hands it the `Bundle` saved earlier, so the user should see the same screen as if nothing happened. This is why saved state matters."]),
  S('Context in one picture', [
    "`Context` is your handle to the system: resources, files, preferences, starting components. **Application context** lives as long as the process. **Activity context** also carries the theme and window, and dies with the Activity.",
    "Rule of thumb: use the Activity context for anything UI-related (inflating views, dialogs, themed resources), and the Application context for anything that outlives a screen (singletons, databases, WorkManager)."],
    code=('Picking the right Context', '''// A singleton must never hold an Activity
class ImageCache private constructor(context: Context) {
    private val appContext = context.applicationContext   // safe to keep forever
    companion object {
        @Volatile private var instance: ImageCache? = null
        fun get(context: Context) = instance ?: synchronized(this) {
            instance ?: ImageCache(context).also { instance = it }
        }
    }
}''')),
 ],
 mistakes=[('Keeping an Activity in a static field or singleton', 'Store `context.applicationContext`, or pass the Context per call.'),
           ('Assuming `onDestroy` always runs', 'Save important data as it changes; the process can die without callbacks.'),
           ('Doing disk or network work in `onCreate` on the main thread', 'Move it to a coroutine on `Dispatchers.IO`, triggered from the ViewModel.')],
 qa=('What happens, step by step, when the user taps your app icon and the process is not running?',
     "The launcher sends an Intent to the system (ActivityManagerService). Since there is no process, Zygote forks a new one. In it, ActivityThread starts, creates the Application object and calls `Application.onCreate`. Then the launcher Activity is created and moved through `onCreate`, `onStart` and `onResume`, and the first frame is drawn. That is a **cold start**; heavy work in `Application.onCreate` delays all of it.")),

X([S('What the lifecycle states really mean', [
    "The lifecycle is a **state machine**: INITIALIZED → CREATED → STARTED → RESUMED, and back down to DESTROYED. Callbacks are the transitions between states. Jetpack exposes the state as `lifecycle.currentState`, so components can react to it without the Activity forwarding every callback.",
    "STARTED means the window is visible, possibly behind a dialog or in multi-window. RESUMED means it is the focused, interactive Activity. In multi-window mode several Activities can be STARTED, but only the top focused one is RESUMED (since Android 10, all visible ones can be resumed, with one holding top focus)."]),
  S('Configuration changes, step by step', [
    "On rotation the system calls `onPause`, `onStop`, `onSaveInstanceState`, `onDestroy` on the old instance and then creates a brand-new instance with `onCreate(savedInstanceState)`. The new instance gets new views and new resources for the new configuration.",
    "The `ViewModelStore` is retained across this recreation (via the non-configuration instance), so the same ViewModel object is handed to the new Activity. That is why a ViewModel survives rotation but not process death: process death destroys the store too.",
    "You can opt out with `android:configChanges` and handle the change yourself in `onConfigurationChanged`. That is fine for things like a video player, but it is easy to get wrong because resources do not reload automatically."]),
  S('Saving state for process death', [
    "`onSaveInstanceState` writes to a `Bundle` that the system keeps outside your process. It must be small (the whole transaction is limited to about 1 MB, shared with other data), so save IDs and user input, not lists or bitmaps. Views with an `id` save some of their own state automatically, such as EditText text and scroll positions."],
    code=('What survives what', '''//                         Rotation   Process death   Back press (finish)
// Local variables            no           no               no
// ViewModel                  yes          no               no
// SavedStateHandle / Bundle  yes          yes              no
// Room / DataStore / files   yes          yes              yes''')),
 ],
 mistakes=[('Starting location updates in `onCreate` and never stopping them', 'Tie them to STARTED with `repeatOnLifecycle` or a lifecycle-aware observer.'),
           ('Putting a large list into the saved Bundle', 'Save an ID or query; reload the data from the repository.'),
           ('Using `configChanges` to "fix" rotation bugs', 'Fix the state handling instead; process death will still expose the same bug.')],
 qa=('What is the difference between ViewModel and onSaveInstanceState? When do you need both?',
     "ViewModel keeps any amount of in-memory data across configuration changes, but is lost on process death. `onSaveInstanceState` (or SavedStateHandle) survives process death but only holds small, serialisable data. In practice you use both: the ViewModel holds the loaded data, and SavedStateHandle holds the minimum needed to reload it, such as the selected ID and the search query.")),

X([S('Why a Fragment has two lifecycles', [
    "A Fragment can exist without a view. When you navigate forward and the Fragment goes onto the back stack, FragmentManager destroys its **view** to save memory but keeps the Fragment **instance** with its fields. When you press Back, `onCreateView` runs again on the same instance.",
    "So anything tied to views (bindings, adapters holding views, observers that update views) must follow the **view lifecycle**, while things tied to the Fragment itself (arguments, ViewModels) follow the Fragment lifecycle."]),
  S('How FragmentManager applies transactions', [
    "`commit()` schedules the transaction on the main thread's queue; it does not run immediately. `commitNow()` runs it synchronously but cannot be added to the back stack. `commitAllowingStateLoss()` lets it run after `onSaveInstanceState`, accepting that the change may be lost on process death.",
    "Committing after state is saved throws `IllegalStateException: Can not perform this action after onSaveInstanceState`. This often happens when a network callback arrives while the app is in the background; collecting with `repeatOnLifecycle` avoids it because the UI only reacts while STARTED."]),
  S('Talking between Fragments', [
    "Fragments should not hold references to each other. Use an **Activity-scoped shared ViewModel** (`activityViewModels()`) for shared state, or the **Fragment Result API** for one-off results such as a picker returning a value."],
    code=('Fragment Result API', '''// In the picker
setFragmentResult("pick_date", bundleOf("date" to selected.toString()))

// In the screen that opened it
setFragmentResultListener("pick_date") { _, bundle ->
    vm.onDatePicked(LocalDate.parse(bundle.getString("date")))
}''')),
 ],
 mistakes=[('Observing with `this` instead of `viewLifecycleOwner` in a Fragment', 'Observers pile up each time the view is recreated; use `viewLifecycleOwner`.'),
           ('Passing data through a Fragment constructor', 'Use `arguments` (a Bundle); the system recreates Fragments with the empty constructor.'),
           ('Calling `commit()` from a background callback', 'Collect results while STARTED, so transactions only happen when state is not saved.')],
 qa=('Why does Android require Fragments to have an empty constructor?',
     "After a configuration change or process death, FragmentManager recreates Fragments by reflection using the no-argument constructor, then restores their `arguments` Bundle. Any values passed through a custom constructor would be lost. Put input data in `arguments` (or navigation args) and, for dependencies, use a FragmentFactory or Hilt.")),

X([S('How the system resolves an implicit Intent', [
    "For an implicit Intent, PackageManager compares its **action**, **categories** and **data** (scheme, host, path, MIME type) against every registered intent filter. All three tests must pass. If several apps match, the user sees a chooser (or the default app for that link).",
    "From Android 11, **package visibility** limits which other apps you can see. To query or launch a specific app you must declare it in a `<queries>` element in the manifest."]),
  S('Tasks and launch modes, explained', [
    "A **task** is a stack of Activities the user sees as one unit in Recents. `standard` always creates a new instance on top. `singleTop` reuses the instance only if it is already on top (it receives `onNewIntent`). `singleTask` keeps one instance in its task and clears everything above it when relaunched. `singleInstance` puts the Activity alone in its own task.",
    "Flags do similar things per launch: `FLAG_ACTIVITY_NEW_TASK` (required when starting from a non-Activity context), `FLAG_ACTIVITY_CLEAR_TOP` (pop everything above an existing instance) and `FLAG_ACTIVITY_SINGLE_TOP`."]),
  S('Deep links vs App Links', [
    "A **deep link** is any URI your app handles via an intent filter; the user may get a chooser. An **Android App Link** is an `https` link verified with a `assetlinks.json` file on your domain, so it opens your app directly without a chooser."],
    code=('A verified App Link filter', '''<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="droidly.io" android:pathPrefix="/q/" />
</intent-filter>''', 'xml')),
 ],
 mistakes=[('Forgetting `android:exported` on components with intent filters (crash on install from Android 12)', 'Declare it explicitly; use `false` unless other apps must start it.'),
           ('Using mutable PendingIntents by default', 'Use `FLAG_IMMUTABLE`; only use `FLAG_MUTABLE` when another app must fill in data.'),
           ('Using `singleTask` to prevent duplicate screens', 'Usually `singleTop` or proper navigation is the right fix; `singleTask` changes back-stack behaviour in surprising ways.')],
 qa=('A notification opens a details screen. When the user presses Back, they leave the app instead of going to the home screen. How do you fix it?',
     "Build a proper back stack for the notification. Use `TaskStackBuilder` (or the Navigation component's `NavDeepLinkBuilder`) so the PendingIntent starts the home Activity with the details Activity on top. Then Back goes to home, as the user expects.")),

X([S('Choosing the right tool for background work', [
    "Ask two questions: **must it run now** (while the user waits), and **must it finish** even if the user leaves? Work tied to a screen goes in `viewModelScope`. Work that must finish but can be deferred goes to **WorkManager**, which persists the request in a database and runs it under constraints, even after a reboot.",
    "User-visible ongoing work (music, navigation, an active upload the user started) uses a **foreground service** with a notification and, from Android 14, a declared `foregroundServiceType`. Exact alarms for alarm-clock apps use AlarmManager."]),
  S('How WorkManager works under the hood', [
    "WorkManager stores each request in its own Room database, then schedules it using JobScheduler (API 23+). When constraints are met, it runs your `Worker` or `CoroutineWorker`. It retries with backoff when you return `Result.retry()`, and supports unique work, chaining and periodic work (minimum 15-minute interval).",
    "Because requests are persisted, they survive process death and reboots. That is the main difference from a coroutine, which dies with the process."]),
  S('Testing process death', [
    "Rotation does not test process death. To test it: put the app in the background, then run `adb shell am kill <package>` (kills only background processes), and reopen it from Recents. Or enable **Don't keep activities** in Developer options to test Activity recreation."],
    code=('Background work decision guide', '''// Needs result for this screen only        -> viewModelScope.launch { }
// Must finish, can wait for good conditions -> WorkManager (CoroutineWorker)
// User-visible and ongoing right now        -> Foreground service (+ type)
// Must fire at an exact time (alarm clock)  -> AlarmManager.setExactAndAllowWhileIdle
// Server wants to wake the app              -> FCM high-priority message''', 'text')),
 ],
 mistakes=[('Using a background `Service` for uploads', 'Background service starts are restricted from Android 8; use WorkManager or a foreground service.'),
           ('Launching long work in `GlobalScope` from an Activity', 'Use WorkManager if it must finish; otherwise use `viewModelScope`.'),
           ('Testing only rotation and calling it "state handling done"', 'Also test process death with `adb shell am kill`.')],
 qa=('How would you upload a large video so it completes even if the user closes the app?',
     "Use WorkManager with a network constraint and an expedited or long-running `CoroutineWorker`. Call `setForeground` to show progress in a notification, since long uploads run as a foreground service under the hood. Upload in chunks with a resumable protocol, so a retry continues from the last confirmed chunk instead of starting over. Use unique work keyed by the video ID to avoid duplicates.")),
]

DEEP['kotlin'] = [
X([S('Why Kotlin feels different from Java', [
    "Kotlin moves many runtime failures to compile time. Nullability is part of the type, `when` can be checked for exhaustiveness, and `val` makes immutability the default. Interviewers look for code that uses these features to make wrong states impossible.",
    "Kotlin compiles to the same JVM bytecode as Java, so features like `data class`, `object` and extension functions are compiler conveniences. Knowing what they compile to helps you answer performance and interop questions."]),
  S('Expressions everywhere', [
    "`if`, `when` and `try` are expressions that return values, so you rarely need temporary `var`s. Functions with a single expression can use `=` instead of a block body."],
    code=('Expressions instead of statements', '''val label = when {
    score >= 75 -> "Strong"
    score >= 50 -> "Needs practice"
    else        -> "Weak area"
}

val port = try { config.port.toInt() } catch (e: NumberFormatException) { 8080 }

fun isAdult(age: Int) = age >= 18''')),
 ],
 mistakes=[('Writing Java-style code with `var`s and null checks everywhere', 'Prefer `val`, expression bodies and the elvis operator.'),
           ('Using `!!` to silence the compiler', 'Handle the null case or change the type so null cannot occur.')],
 qa=('What does a Kotlin `object` declaration compile to?',
     "A class with a private constructor and a static `INSTANCE` field initialised in a static block. Initialisation is lazy (on first access of the class) and thread-safe, because the JVM guarantees class initialisation happens once. From Java you access it as `MyObject.INSTANCE`, unless members are marked `@JvmStatic`.")),

X([S('How null safety works at runtime', [
    "Nullability is mostly a compile-time feature. The compiler inserts checks only at the boundaries: when a public function takes a non-null parameter, Kotlin adds `Intrinsics.checkNotNullParameter` so Java callers cannot pass null unnoticed.",
    "Values coming from Java have **platform types** (shown as `String!`). The compiler lets you treat them as nullable or not, and if you guess wrong you get a NullPointerException. Annotating Java code with `@Nullable`/`@NonNull` turns these into real Kotlin types."]),
  S('Smart casts and their limits', [
    "After `if (x != null)` or `if (x is String)`, the compiler treats `x` as the narrower type, but only if it can prove `x` cannot change in between. Local `val`s and `val` properties without custom getters in the same module qualify. A `var` property can be changed by another thread, so it is not smart cast; copy it into a local `val` first."],
    code=('Smart cast on a var property', '''class Player { var current: Track? = null }

fun play(p: Player) {
    // if (p.current != null) start(p.current)   // error: smart cast impossible
    val track = p.current ?: return              // copy to a local val
    start(track)                                 // track is Track, not Track?
}''')),
  S('lateinit and lazy compared', [
    "`lateinit var` has no initial value and throws `UninitializedPropertyAccessException` if read too early. It only works on non-primitive `var`s, and you can check `::prop.isInitialized`. `by lazy` is for `val`s; the first read runs the initialiser and caches the result. The default mode is synchronized; use `LazyThreadSafetyMode.NONE` on the main thread to avoid locking."]),
 ],
 mistakes=[('Reading a `lateinit` property before it is set', 'Initialise it in `onCreate`/DI, or use a nullable type or `lazy`.'),
           ('Trusting Java return values to be non-null', 'Treat platform types as nullable unless the Java API is annotated.'),
           ('Chaining `?.let { }` five levels deep', 'Use early returns with `?: return` for readable code.')],
 qa=('What is the difference between `?.let { }` and `if (x != null)`?',
     "Both handle null, but `?.let` works on any expression (including mutable properties) because it captures the value once into `it`, while `if (x != null)` only smart-casts stable values. `?.let` also returns the lambda result, so you can chain `?:` for a default. For multiple statements, an early `val v = x ?: return` is often the most readable.")),

X([S('What a data class generates', [
    "For each property in the primary constructor, a data class generates `componentN()` (for destructuring), plus `equals`, `hashCode`, `toString` and `copy`. Properties declared in the class body are ignored by all of these, which is a common source of surprising equality bugs.",
    "`copy()` is a **shallow** copy. If a property is a mutable list, both copies share it. Prefer immutable collections in data classes so `copy` is safe."]),
  S('Sealed classes vs enums', [
    "An enum has a fixed set of **instances**, all of the same shape. A sealed class has a fixed set of **subclasses**, each with its own data. Use an enum for simple choices (`Theme.DARK`), and a sealed type when cases carry different data (`Loaded(items)` vs `Error(message)`).",
    "Because the compiler knows every subclass, `when` over a sealed type is exhaustive. Adding a new subclass breaks every `when` that does not handle it, at compile time."]),
  S('Value classes', [
    "`@JvmInline value class UserId(val raw: String)` is a separate type at compile time, so you cannot pass an `OrderId` where a `UserId` is expected. At runtime it is usually just the `String`, with no wrapper object. It gets boxed when used as a generic type or a nullable type."],
    code=('Data class equality pitfall', '''data class Cart(val id: String) {
    var items: List<Item> = emptyList()   // NOT part of equals/hashCode/copy
}

val a = Cart("c1").apply { items = listOf(apple) }
val b = Cart("c1")
println(a == b)            // true, even though items differ
println(a.copy().items)    // [] — copy() lost the items''')),
 ],
 mistakes=[('Declaring important fields in the data class body', 'Put every field that defines the value in the primary constructor.'),
           ('Using `var` and mutable lists inside UI state data classes', 'Use `val` and read-only `List`; update with `copy`.'),
           ('Using a sealed class with an `else` branch in `when`', 'Drop `else` so the compiler flags new cases.')],
 qa=('Why should UI state classes be immutable?',
     "Immutable state can be compared and shared safely. StateFlow and Compose decide whether to update by comparing old and new values; if you mutate a list inside the same object, the reference is equal and the UI does not update. Immutability also removes threading bugs, because no one can change the object after it is published. You create a new state with `copy`.")),

X([S('The two questions that pick a scope function', [
    "1) Do you want to refer to the object as `this` (configuring it) or `it` (passing it around)? 2) Do you want to get the **object back** or the **lambda result**? `apply` = this + object, `also` = it + object, `run`/`with` = this + result, `let` = it + result.",
    "All five are `inline`, so there is no runtime cost. They exist purely for readability, which means overusing them defeats the point."]),
  S('How extension functions really work', [
    "An extension compiles to a static function whose first parameter is the receiver: `fun View.show()` becomes `static void show(View $this)`. That is why extensions are resolved by the **declared** type at compile time, not by the runtime type, and why a member function always wins over an extension with the same signature."],
    code=('Static dispatch of extensions', '''open class Shape
class Circle : Shape()

fun Shape.name() = "shape"
fun Circle.name() = "circle"

val s: Shape = Circle()
println(s.name())   // "shape" — chosen by the declared type, not the runtime type''')),
  S('Extension properties and nullable receivers', [
    "Extensions can be declared on nullable types (`fun String?.orDash() = this ?: \"—\"`), which lets you call them safely on null values. Extension properties cannot have backing fields; they are computed every time."]),
 ],
 mistakes=[('Nesting `let` inside `apply` inside `run`', 'Keep scope functions one level deep, or use named local variables.'),
           ('Expecting extension functions to be overridden', 'Use a member function or interface for polymorphism.'),
           ('Using `also` to transform a value', '`also` returns the original object; use `let` or `map` to transform.')],
 qa=('When would you choose an extension function over a utility class?',
     "When the function reads naturally as an operation on the type, for example `dp.toPx()` or `view.show()`. It improves discoverability through autocomplete and keeps call sites readable. Keep extensions in a focused file or scope them (e.g. private or in a specific module) so they do not pollute common types like String across the whole codebase.")),

X([S('What inline actually does', [
    "Without `inline`, each lambda becomes an object implementing `Function1`, and capturing lambdas allocate a new object at every call. An `inline` function's body and its lambda arguments are copied into the call site, so there is no allocation and no virtual call.",
    "This is why standard functions like `map`, `filter` and `let` are inline. It also allows **non-local returns**: `return` inside an inlined lambda returns from the outer function. Large inline functions increase bytecode size, so only inline small functions that take lambdas."]),
  S('noinline and crossinline', [
    "`noinline` marks a lambda parameter that should stay an object, for example because you store it in a field. `crossinline` keeps the lambda inlined but forbids non-local returns, which is needed when the lambda is called from another context such as a `Runnable`."]),
  S('Variance and reified generics', [
    "JVM generics are erased at runtime: a `List<String>` is just a `List`. `reified` works around this inside inline functions by substituting the real type at each call site, so `T::class` and `is T` work.",
    "Variance answers \"can a `List<Dog>` be used where a `List<Animal>` is expected?\" For a read-only `List<out T>`, yes (covariant). For a `MutableList<T>`, no (invariant), because you could add a Cat to a list of Dogs."],
    code=('Why MutableList is invariant', '''val dogs: MutableList<Dog> = mutableListOf(Dog())
// val animals: MutableList<Animal> = dogs   // compile error, and for good reason:
// animals.add(Cat())                        // would put a Cat into a list of Dogs

val readOnly: List<Animal> = dogs            // fine: List<out E> only produces''')),
 ],
 mistakes=[('Marking big functions `inline` "for performance"', 'Inline only small higher-order functions; otherwise you bloat bytecode.'),
           ('Checking `if (x is List<String>)`', 'Generic types are erased; check `is List<*>` and the element types separately.'),
           ('Making a producer interface invariant', 'Use `out T` when a type only returns T, so callers get flexible subtyping.')],
 qa=('Explain `inline fun <reified T> Activity.start()` and why reified needs inline.',
     "Normally a generic `T` is erased, so the function cannot know which class to start. Because the function is inline, its body is copied into each call site, where the compiler knows the actual type, and `reified` lets it use `T::class.java` there. Without inline, there is no call-site copy, so the type information would not exist at runtime.")),
]

DEEP['compose'] = [
X([S('How Compose turns functions into UI', [
    "The Compose compiler plugin rewrites every `@Composable` function so it receives a hidden `Composer` parameter. As your functions run, they record what they emit into a data structure called the **slot table**. That tree of nodes becomes your UI.",
    "When state that a composable read changes, Compose marks that composable's **restart scope** as invalid and, on the next frame, re-runs just that function. That is recomposition. Functions whose inputs did not change can be skipped."]),
  S('The three phases of a frame', [
    "Every frame goes through **composition** (what to show, runs your composable functions), **layout** (measure and place) and **drawing** (render pixels). State read during composition triggers recomposition; state read only during layout or drawing (for example inside `Modifier.offset { }` or `drawBehind { }`) skips composition and is cheaper."]),
  S('Why composables must be side-effect free', [
    "Compose may run a composable many times, skip it, run it on a different thread in future, or throw away the result. If a composable writes to a database or logs an analytics event directly, that side effect happens an unpredictable number of times. Side effects belong in effect handlers or event callbacks."],
    code=('Side effect in composition (wrong) vs callback (right)', '''@Composable
fun ProductCard(p: Product, onOpen: (String) -> Unit) {
    // analytics.log("shown ${p.id}")   // wrong: runs on every recomposition
    Card(onClick = { onOpen(p.id) }) {   // right: runs once per click
        Text(p.title)
    }
}''')),
 ],
 mistakes=[('Calling a ViewModel function directly in the composable body', 'Call it from an event callback or a `LaunchedEffect`.'),
           ('Passing the whole ViewModel into deep child composables', 'Pass only the state and lambdas each child needs.'),
           ('Applying `padding` before `clickable` and wondering why the touch area is small', 'Modifier order matters; each modifier wraps the next.')],
 qa=('What is recomposition and what triggers it?',
     "Recomposition is Compose re-running composable functions to update the UI. It is triggered when a `State` object that a composable read during composition changes. Compose tracks those reads automatically through the snapshot system. Only the affected restart scopes re-run, and composables whose parameters are stable and unchanged are skipped.")),

X([S('How state changes are tracked', [
    "`mutableStateOf` creates a value inside Compose's **snapshot system**. When a composable reads `state.value` during composition, Compose records that read. When something writes a new value, the snapshot is applied and every composable that read it is scheduled to recompose.",
    "This is also why mutating a regular `ArrayList` inside state does nothing: the state object's reference did not change, so no write was recorded. Use `mutableStateListOf` or replace the list with a new one."]),
  S('remember and positional memoisation', [
    "`remember` stores a value in the slot table at the composable's **position** in the tree. On recomposition, the same call at the same position returns the stored value. If the composable leaves the composition (for example an `if` turns false), the value is forgotten.",
    "`remember(key) { }` recalculates when the key changes. `rememberSaveable` additionally writes the value into the saved instance state Bundle, so it survives rotation and process death; it needs a type that fits in a Bundle or a custom `Saver`."]),
  S('Where to hoist state', [
    "Hoist state to the **lowest common ancestor** that reads it, and no higher. UI element state (a text field's focus, an expanded card) can live in the composable. Screen state that comes from data or must survive navigation belongs in the ViewModel."],
    code=('Mutating vs replacing a list', '''var items by remember { mutableStateOf(listOf<String>()) }

// items.toMutableList().add("x")          // no effect on UI
items = items + "x"                        // new list -> recomposition

val todos = remember { mutableStateListOf<Todo>() }
todos.add(Todo("Buy milk"))                // observable list: recomposes''')),
 ],
 mistakes=[('`val count = mutableStateOf(0)` without `remember`', 'State is recreated every recomposition; wrap it in `remember`.'),
           ('Storing state in a mutable `ArrayList` inside `mutableStateOf`', 'Replace the list, or use `mutableStateListOf`.'),
           ('Keeping screen data in `remember` instead of the ViewModel', 'It is lost on navigation and process death; move it to the ViewModel.')],
 qa=('What is the difference between `remember` and `rememberSaveable`?',
     "`remember` keeps a value across recompositions while the composable stays in composition, but it is lost on configuration change and process death. `rememberSaveable` also saves the value into the instance state Bundle, so it survives rotation and process death. Use rememberSaveable for small UI state the user would expect to keep, such as text being typed or a selected tab.")),

X([S('How skipping decides', [
    "When a parent recomposes, Compose compares each child's new parameters with the previous ones. If every parameter is **stable** and `equals` the old value, the child is skipped. A type is stable if Compose can trust that a change will be reported: immutable values, primitives, `String`, function types, and classes marked `@Stable` or `@Immutable`.",
    "Collections from `kotlin.collections` (`List`, `Map`) are interfaces that could be mutable, so they were unstable before **strong skipping mode**. With strong skipping (default since Kotlin 2.0.20), unstable parameters are compared by instance identity instead, so many more composables can skip."]),
  S('Lambdas and recomposition', [
    "A lambda that captures values is a new object when those values change. Compose automatically remembers lambdas whose captures are stable. Method references to a ViewModel (`vm::onClick`) are stable as long as the ViewModel instance is the same."]),
  S('Finding the problem', [
    "Use **Layout Inspector** in Android Studio to see recomposition and skip counts per composable. Enable **Compose compiler reports** to see which classes are inferred as unstable and which functions are not skippable."],
    code=('Enabling compiler reports', '''// build.gradle.kts (Kotlin 2.x Compose compiler plugin)
composeCompiler {
    reportsDestination = layout.buildDirectory.dir("compose_reports")
    metricsDestination = layout.buildDirectory.dir("compose_metrics")
}
// Look for "unstable" params and "restartable but not skippable" functions''')),
 ],
 mistakes=[('Adding `@Stable` to a class with mutable `var` fields that are not State', 'You are lying to the compiler; the UI can miss updates.'),
           ('Reading a fast-changing state (scroll, animation) high in the tree', 'Read it in the lowest composable, or in a layout or draw lambda.'),
           ('Optimising stability before measuring', 'Check recomposition counts first; most screens do not need tuning.')],
 qa=('A list item recomposes every time the user types in a search box above the list. Why, and how do you fix it?',
     "The search text state is probably read in a composable that also contains the list, so the whole scope recomposes on each keystroke, and the item parameters may be unstable. Fix it by reading the text only inside the search field composable, passing stable item models (immutable data classes) to items, using `key`s in LazyColumn, and checking with Layout Inspector that items are now skipped.")),

X([S('How LaunchedEffect works', [
    "`LaunchedEffect(key1, key2)` starts a coroutine when it enters composition, scoped to that position in the tree. If any key changes, the running coroutine is **cancelled** and a new one starts. When the composable leaves composition, the coroutine is cancelled. Choose keys carefully: they define when the effect restarts.",
    "`DisposableEffect` works the same way but for non-coroutine resources: it runs setup on entry and `onDispose` on exit or when keys change."]),
  S('Stale captures and rememberUpdatedState', [
    "A long-running effect captures the values present when it started. If a callback parameter changes later, the effect still calls the old one. `rememberUpdatedState(value)` gives the effect a State that always holds the latest value, without restarting the effect."]),
  S('Turning Compose state into a Flow', [
    "`snapshotFlow { state.value }` creates a Flow that emits whenever the state read inside it changes. It is the bridge for sending UI state, such as scroll position, to analytics or a ViewModel."],
    code=('Report when the user scrolls past the first item', '''val listState = rememberLazyListState()
LaunchedEffect(listState) {
    snapshotFlow { listState.firstVisibleItemIndex }
        .map { it > 0 }
        .distinctUntilChanged()
        .filter { it }
        .collect { analytics.log("feed_scrolled") }
}''')),
 ],
 mistakes=[('`LaunchedEffect(true)` to load data on every screen entry', 'Load in the ViewModel `init` or on a trigger, so it does not reload on every return.'),
           ('Using a changing value as a key when you do not want restarts', 'Use stable keys and `rememberUpdatedState` for the changing value.'),
           ('Launching coroutines with `GlobalScope` from a click handler', 'Use `rememberCoroutineScope()` so work is cancelled when the UI leaves.')],
 qa=('What is the difference between LaunchedEffect and rememberCoroutineScope?',
     "LaunchedEffect starts a coroutine automatically as part of composition, and restarts it when its keys change; use it for work that should happen because the UI is showing something. rememberCoroutineScope returns a scope you launch from yourself in event handlers such as onClick, for example to animate a scroll. Both cancel their work when the composable leaves composition.")),

X([S('How lazy lists save work', [
    "`LazyColumn` composes and lays out only the items that fit on screen, plus a small buffer. As you scroll, items leaving the screen are disposed and new ones are composed. Since Compose 1.5+, the slots of off-screen items are **reused** for new items of the same `contentType`, which reduces work further.",
    "Keys tell Compose which item is which. Without them, item state is tied to position, so inserting at the top shifts all state down by one and animations look wrong."]),
  S('Why release builds and Baseline Profiles matter', [
    "Compose ships as a library, not as part of the OS, so its code is not pre-compiled on the device. On first launches ART interprets or JIT-compiles it, which causes jank. A **Baseline Profile** lists hot code paths, and the Play Store (or ProfileInstaller) uses it to compile them ahead of time on install.",
    "Debug builds also disable optimisations and add debugging checks, so they can be several times slower. Performance numbers from debug builds are not meaningful."]),
  S('Navigation basics', [
    "Pass IDs between destinations, not whole objects; the destination loads the object from the repository. That keeps navigation arguments small and makes process death safe, because only the ID needs to be restored."],
    code=('Type-safe navigation with an ID', '''@Serializable data class ProductRoute(val id: String)

NavHost(nav, startDestination = HomeRoute) {
    composable<HomeRoute> { HomeScreen(onOpen = { nav.navigate(ProductRoute(it)) }) }
    composable<ProductRoute> { entry ->
        val id = entry.toRoute<ProductRoute>().id   // ViewModel loads by id
        ProductScreen(id)
    }
}''')),
 ],
 mistakes=[('Using `items(list)` without a `key` for lists that change', 'Pass `key = { it.id }` so state and animations follow the item.'),
           ('Formatting dates and prices inside item composables', 'Prepare display strings in the ViewModel.'),
           ('Passing large objects as navigation arguments', 'Pass an ID; load data in the destination ViewModel.')],
 qa=('How do you make a Compose screen scroll smoothly on low-end devices?',
     "Measure first in a release build with a Macrobenchmark or JankStats. Then: add a Baseline Profile; use keys and contentType in lazy lists; keep item composables light by precomputing data; load images with a library like Coil at the right size; defer fast-changing state reads to layout or draw; and confirm with Layout Inspector that items are being skipped.")),
]
