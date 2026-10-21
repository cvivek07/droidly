from common import X, S

DEEP = {}

DEEP['di'] = [
X([S('The idea in one example', [
    "Imagine a `CheckoutViewModel` that creates its own `RazorpayGateway()` inside. You cannot test checkout without hitting a real payment service, and you cannot switch to another provider without editing the ViewModel. With dependency injection, the ViewModel just asks for a `PaymentGateway` in its constructor. Someone else decides which one to give it.",
    "That \"someone else\" can be you, writing the wiring by hand, or a library like Hilt that writes it for you."],
    code=('Manual DI first', '''interface PaymentGateway { suspend fun pay(amount: Long): Boolean }
class RazorpayGateway(private val client: OkHttpClient) : PaymentGateway { /* ... */ }
class FakeGateway(var result: Boolean = true) : PaymentGateway {
    override suspend fun pay(amount: Long) = result
}

class CheckoutViewModel(private val payments: PaymentGateway) : ViewModel()

// App code
val vm = CheckoutViewModel(RazorpayGateway(okHttp))
// Test code
val testVm = CheckoutViewModel(FakeGateway(result = false))''')),
  S('Why use a library', [
    "Manual wiring is fine for a few classes. In a real app, hundreds of objects depend on each other, some must be single instances, and some must live only as long as a screen. A DI library builds this **dependency graph** for you and manages how long each object lives."]),
  S('Compile time vs runtime', [
    "Dagger and Hilt check the whole graph while building the app and generate plain Java code to create objects. A missing binding is a build error, and there is no reflection at runtime. Koin resolves objects at runtime: setup is simpler and builds are faster, but a missing binding is a crash you find only when that code runs."]),
 ],
 mistakes=[('Creating dependencies inside classes with `SomeService()`', 'Ask for them in the constructor.'),
           ('Using DI as a global lookup (`get()` everywhere)', 'Inject through constructors so dependencies are visible.'),
           ('Mocking everything in tests', 'Prefer simple fakes that implement the interface.')],
 qa=('What problems does dependency injection solve?',
     "It removes hard-coded creation of dependencies, so classes can be tested with fakes and implementations can be swapped. It centralises how objects are built and how long they live, such as one OkHttpClient for the whole app. It also makes each class's dependencies visible in its constructor, which makes the code easier to understand.")),

X([S('The three annotations you need first', [
    "`@HiltAndroidApp` on your `Application` class starts Hilt and creates the app-level container. `@AndroidEntryPoint` on an Activity, Fragment, View or Service lets Hilt inject fields into it. `@HiltViewModel` with an `@Inject constructor` lets Hilt create ViewModels, which you get with `by viewModels()` or `hiltViewModel()`."]),
  S('Components are containers with a lifetime', [
    "Hilt creates a container (component) for each Android lifetime. `SingletonComponent` lives as long as the app. `ActivityRetainedComponent` survives rotation. `ViewModelComponent` lives as long as one ViewModel. `ActivityComponent`, `FragmentComponent` and `ViewComponent` match those objects.",
    "Components are nested: an Activity-level object can use anything from the app level, but an app-level object cannot use something from an Activity, because the Activity may not exist."],
    code=('Field injection in an Activity', '''@AndroidEntryPoint
class PlayerActivity : AppCompatActivity() {
    @Inject lateinit var analytics: Analytics     // filled in before onCreate's body runs
    private val vm: PlayerViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)          // injection happens here
        analytics.screen("player")
    }
}''')),
  S('What Hilt gives you for free', [
    "Without writing any module, you can inject `@ApplicationContext context: Context`, `@ActivityContext`, `SavedStateHandle` into ViewModels, and the Activity or Fragment itself in their components."]),
 ],
 mistakes=[('Using an injected field before `super.onCreate()`', 'Injection happens in `super.onCreate()`; use fields after it.'),
           ('Forgetting `@AndroidEntryPoint` on the host Activity of an annotated Fragment', 'Every parent must be an entry point too.'),
           ('Injecting an Activity-scoped object into a singleton', 'Singletons cannot depend on shorter-lived objects.')],
 qa=('What is the difference between SingletonComponent and ActivityRetainedComponent?',
     "SingletonComponent lives for the whole app process. ActivityRetainedComponent lives as long as an Activity logically exists, so it survives configuration changes but is destroyed when the Activity finishes. Use the retained one for things that should be shared by one screen flow but not kept forever.")),

X([S('When you need a module', [
    "Hilt can create any class that has an `@Inject constructor`. Modules are for the cases where it cannot: interfaces (which implementation should it use?), classes from libraries you do not own (Retrofit, Room, OkHttp) and objects built with builders."]),
  S('@Binds vs @Provides', [
    "`@Binds` says \"when someone asks for this interface, give them this implementation\". It is an abstract function with no body, so Hilt generates very little code. `@Provides` is a normal function that builds and returns an object; use it when you need code to create the object."],
    code=('Both kinds of modules', '''@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {
    @Binds @Singleton
    abstract fun bindNotes(impl: NotesRepositoryImpl): NotesRepository
}

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {
    @Provides @Singleton
    fun db(@ApplicationContext ctx: Context): AppDb =
        Room.databaseBuilder(ctx, AppDb::class.java, "app.db").build()

    @Provides
    fun notesDao(db: AppDb): NotesDao = db.notes()      // cheap, no scope needed
}''')),
  S('How Hilt finds bindings', [
    "When a class asks for `NotesRepository`, Hilt looks for a binding in the current component and its parents. Here it finds `@Binds`, which points to `NotesRepositoryImpl`, which has an `@Inject constructor` needing `NotesDao`, which comes from `@Provides`. All of this is checked at build time."]),
 ],
 mistakes=[('Using `@Provides` to return `NotesRepositoryImpl(dao)` by hand', 'Add `@Inject` to the constructor and use `@Binds`.'),
           ('Installing a module in the wrong component', 'Install in the component whose lifetime matches the objects.'),
           ('Building Retrofit in many places', 'Provide one instance in a singleton module.')],
 qa=('Why prefer @Binds over @Provides for interfaces?',
     "@Binds only tells Dagger which implementation to use, so it generates less code and no extra factory method, which keeps builds faster and the app smaller. @Provides needs a function body that Dagger has to call. Use @Provides only when you must write code to construct the object.")),

X([S('Scopes in plain words', [
    "By default Hilt creates a **new object every time** someone asks for it. A scope annotation says \"create one and reuse it for the life of this component\". `@Singleton` = one per app. `@ActivityRetainedScoped` = one per Activity across rotation. `@ViewModelScoped` = one per ViewModel."]),
  S('When to scope', [
    "Scope objects that are expensive to create (OkHttpClient, the database) or that hold shared state (an in-memory cache, a session manager). Do not scope everything: a scoped object stays in memory for the whole component lifetime, even if no one uses it anymore."]),
  S('Qualifiers: two of the same type', [
    "If you need two `OkHttpClient`s (one with auth, one without) or two dispatchers, Hilt cannot tell which you want. A qualifier is a small annotation that gives each binding a name, checked by the compiler."],
    code=('Two clients, two qualifiers', '''@Qualifier @Retention(AnnotationRetention.BINARY) annotation class AuthClient
@Qualifier @Retention(AnnotationRetention.BINARY) annotation class PublicClient

@Module @InstallIn(SingletonComponent::class)
object HttpModule {
    @Provides @Singleton @PublicClient
    fun public(): OkHttpClient = OkHttpClient()

    @Provides @Singleton @AuthClient
    fun auth(@PublicClient base: OkHttpClient, i: AuthInterceptor): OkHttpClient =
        base.newBuilder().addInterceptor(i).build()      // shares the connection pool
}

class ProfileApi @Inject constructor(@AuthClient private val client: OkHttpClient)''')),
 ],
 mistakes=[('Marking every class `@Singleton`', 'Scope only shared or expensive objects.'),
           ('Using `@Named("x")` strings everywhere', 'Custom qualifiers are type-safe and refactor-friendly.'),
           ('Putting a `@ViewModelScoped` binding in SingletonComponent', 'The scope must match the component it is installed in.')],
 qa=('What happens if you do not add a scope to a binding?',
     "Hilt creates a new instance every time the dependency is requested. That is the right default for small, stateless objects. If an object holds shared state or is expensive, add a scope that matches how long it should live, such as @Singleton for an app-wide OkHttpClient.")),

X([S('Testing without Hilt', [
    "If your classes use constructor injection, most unit tests do not need Hilt at all. Create the class with `FakeRepository()` and call its functions. Tests stay fast and simple."]),
  S('Replacing bindings in Android tests', [
    "For instrumented tests that run the real app, annotate the test with `@HiltAndroidTest`, add `HiltAndroidRule`, and swap production modules with `@TestInstallIn(components = [...], replaces = [ProdModule::class])`. Every test then gets your fake instead of the real thing."],
    code=('Swapping a module in tests', '''@Module
@TestInstallIn(components = [SingletonComponent::class], replaces = [RepositoryModule::class])
abstract class FakeRepositoryModule {
    @Binds abstract fun bindNotes(fake: FakeNotesRepository): NotesRepository
}

@HiltAndroidTest
class NotesScreenTest {
    @get:Rule val hilt = HiltAndroidRule(this)
    @Test fun showsNotes() { /* launch the screen and assert */ }
}''')),
  S('Assisted injection for runtime values', [
    "Some objects need both injected dependencies and a value known only at runtime, such as a download ID. Mark the runtime parameter with `@Assisted`, the constructor with `@AssistedInject`, and create a factory interface with `@AssistedFactory`. You inject the factory and call `create(id)`."]),
 ],
 mistakes=[('Adding Hilt to plain unit tests', 'Construct the class directly with fakes.'),
           ('Using `@UninstallModules` in every test class', 'Prefer one `@TestInstallIn` module shared by all tests.'),
           ('Passing runtime IDs through a singleton setter', 'Use assisted injection or SavedStateHandle.')],
 qa=('How would you give a ViewModel both an injected repository and a screen argument like an item ID?',
     "For navigation arguments, the simplest way is SavedStateHandle: Hilt injects it into the ViewModel and it contains the arguments, so you read the ID from it. For other runtime values, use assisted injection with an @AssistedFactory, and in Compose, hiltViewModel can take a creation callback for assisted ViewModels.")),
]

DEEP['networking'] = [
X([S('What happens on one request', [
    "When you call a Retrofit function, Retrofit reads its annotations (`@GET`, `@Query`, `@Body`), builds an HTTP request, and hands it to OkHttp. OkHttp runs it through your interceptors, finds or opens a connection, sends it, and passes the response back through the interceptors. Retrofit then uses a converter (Moshi, kotlinx.serialization) to turn the JSON into your Kotlin class.",
    "With `suspend` functions, Retrofit runs the call off the main thread for you, so the function is main-safe."]),
  S('Connections are reused', [
    "Opening a secure connection is slow: a DNS lookup, a TCP handshake and a TLS handshake. OkHttp keeps a **connection pool** and reuses connections to the same server, and HTTP/2 can send many requests over one connection at once. That is why you should share a single `OkHttpClient` instead of creating one per request."],
    code=('One client, one Retrofit', '''val client = OkHttpClient.Builder()
    .connectTimeout(10, TimeUnit.SECONDS)
    .readTimeout(20, TimeUnit.SECONDS)
    .build()

val retrofit = Retrofit.Builder()
    .baseUrl("https://api.example.com/v1/")      // must end with /
    .client(client)
    .addConverterFactory(Json.asConverterFactory("application/json".toMediaType()))
    .build()

val api: ShopApi = retrofit.create()''')),
  S('Response<T> or plain T?', [
    "If a suspend function returns `T`, Retrofit throws `HttpException` for non-2xx responses. If it returns `Response<T>`, you get the status code, headers and error body and decide yourself. Use `Response<T>` when you need headers or want to handle error codes without exceptions."]),
 ],
 mistakes=[('Creating a new OkHttpClient per request', 'Share one client so connections and threads are reused.'),
           ('A base URL without a trailing slash', 'Retrofit requires the base URL to end with `/`.'),
           ('Parsing large JSON on the main thread with a manual call', 'Let Retrofit do it in a suspend function.')],
 qa=('What is the difference between Retrofit and OkHttp?',
     "OkHttp is the HTTP client that actually sends requests: connections, pooling, HTTP/2, caching, interceptors and TLS. Retrofit sits on top and turns an annotated Kotlin interface into OkHttp calls, including converting JSON to objects. Retrofit makes APIs easy to declare; OkHttp does the network work.")),

X([S('The interceptor chain', [
    "Interceptors form a chain, like layers of an onion. Each one gets the request, can change it, calls `chain.proceed(request)` to pass it on, and then sees the response on the way back. That makes them perfect for anything that applies to every request: headers, logging, metrics, retries."],
    code=('Timing every request', '''class TimingInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val start = System.nanoTime()
        val response = chain.proceed(chain.request())
        val ms = (System.nanoTime() - start) / 1_000_000
        Log.d("HTTP", "${chain.request().url.encodedPath} took ${ms}ms (${response.code})")
        return response
    }
}''')),
  S('Application vs network interceptors', [
    "An **application interceptor** (`addInterceptor`) runs once per call. It does not see redirects or cached responses separately, so it is the right place for auth headers and logging. A **network interceptor** (`addNetworkInterceptor`) runs for every real network request, including redirects, and sees the exact bytes sent. It does not run when the answer comes from the cache."]),
  S('Logging safely', [
    "`HttpLoggingInterceptor` is great while developing. Add it only in debug builds, and use `redactHeader(\"Authorization\")` so tokens never appear in logs."]),
 ],
 mistakes=[('Calling `chain.proceed()` twice in one interceptor', 'Call it once; use an Authenticator or retry logic for repeats.'),
           ('Logging request bodies in release builds', 'Add the logging interceptor only for debug, with redaction.'),
           ('Doing slow work (disk reads) inside interceptors', 'Keep interceptors fast; cache values like tokens in memory.')],
 qa=('Where would you add an auth header, and why there?',
     "In an application interceptor, because it runs once per call regardless of redirects or retries and applies to every request made by that client. For refreshing the token after a 401, I would use an OkHttp Authenticator instead, because it is designed to retry with new credentials.")),

X([S('Access and refresh tokens', [
    "Most APIs give you a short-lived **access token** (say 15 minutes) for normal calls, and a long-lived **refresh token** used only to get new access tokens. When the access token expires, the server answers `401 Unauthorized`. The app should quietly refresh and retry, without the user noticing."]),
  S('Using OkHttp Authenticator', [
    "OkHttp calls your `Authenticator` automatically when a response is 401. You return a new request with a fresh token, and OkHttp retries it. Return `null` to give up, for example when the refresh token is also invalid; then log the user out."]),
  S('Avoiding the refresh storm', [
    "If five requests fail with 401 at the same moment, you do not want five refresh calls. Use a lock so only one thread refreshes. The others wait, then notice the token already changed and simply retry with the new one."],
    code=('A refresh with a mutex-style check', '''override fun authenticate(route: Route?, response: Response): Request? {
    if (responseCount(response) >= 2) return null             // stop endless loops
    val usedToken = response.request.header("Authorization")?.substringAfter("Bearer ")
    synchronized(lock) {
        val latest = tokenStore.accessToken()
        val fresh = if (latest != null && latest != usedToken) latest     // someone already refreshed
                    else refreshBlocking() ?: run { tokenStore.clear(); return null }
        return response.request.newBuilder().header("Authorization", "Bearer $fresh").build()
    }
}''')),
 ],
 mistakes=[('Refreshing tokens inside an interceptor for every request', 'Refresh only on 401 using an Authenticator.'),
           ('No limit on retries', 'Stop after one retry, or the app loops forever on a bad refresh token.'),
           ('Storing tokens in plain SharedPreferences', 'Use encrypted storage backed by the Android Keystore.')],
 qa=('Five API calls fail with 401 at the same time. How do you make sure the token is refreshed only once?',
     "Put the refresh inside a lock in the Authenticator. The first thread refreshes and saves the new token. Each other thread, once it gets the lock, compares the token it used with the current saved token; if they differ, another thread already refreshed, so it just retries with the current token instead of refreshing again.")),

X([S('Kinds of failure', [
    "Not all errors are equal. **No connection or timeout** (`IOException`): maybe retry, show \"check your connection\". **4xx** (bad request, not found, forbidden): the request is wrong, retrying will not help. **5xx** (server error): maybe retry later. **Parsing errors**: a bug, report it. Treat each kind differently in the UI."]),
  S('Retrying the right way', [
    "Only retry when it is safe and likely to help: network errors and some 5xx, and only for requests that can be repeated without harm (GET, or POST with an idempotency key). Wait longer each time (exponential backoff) and add a little randomness (jitter) so thousands of phones do not retry at the same instant."],
    code=('Retry with exponential backoff', '''suspend fun <T> retryIO(times: Int = 3, first: Long = 500, block: suspend () -> T): T {
    var wait = first
    repeat(times - 1) {
        try { return block() } catch (e: IOException) { /* fall through and retry */ }
        delay(wait + Random.nextLong(0, wait / 2))      // backoff + jitter
        wait *= 2
    }
    return block()                                      // last try: let errors escape
}''')),
  S('HTTP caching basics', [
    "Give OkHttp a `Cache(dir, size)` and it will follow the server's `Cache-Control` headers. `max-age=60` means \"use the saved copy for 60 seconds\". With an `ETag`, OkHttp asks \"has it changed?\" and gets a tiny `304 Not Modified` if not, saving data. For true offline use, store data in Room instead."]),
 ],
 mistakes=[('Retrying a payment POST without an idempotency key', 'Send a unique key so the server can ignore duplicates.'),
           ('Showing "Something went wrong" for every error', 'Show different messages for offline, server and input errors.'),
           ('Retrying 400 or 401 errors', 'Fix the request or refresh auth; do not blindly retry.')],
 qa=('Why add jitter to retry delays?',
     "If many devices fail at the same moment, for example during a server outage, plain exponential backoff makes them all retry at exactly the same times, creating traffic spikes that can knock the server over again. Adding a small random amount to each delay spreads the retries out.")),

X([S('HTTPS and the trust chain', [
    "HTTPS encrypts traffic and proves you are talking to the real server. The server sends a certificate signed by a **certificate authority** (CA) that the phone already trusts. Since Android 9, plain HTTP is blocked by default, which is good. You can allow exceptions only in the network security config, ideally only for debug."]),
  S('Certificate pinning', [
    "Pinning means the app also checks that the server's key matches one you expect. Even if someone tricks the phone into trusting a fake CA, the connection fails. The risk: if the server's certificate changes and the app does not know the new key, every request fails. Always pin a backup key and plan certificate updates."]),
  S('Secrets do not belong in the app', [
    "Anything inside the APK can be extracted with free tools, including `BuildConfig` strings and obfuscated code. Keys that must stay secret, such as a payment provider's secret key, stay on your server. The app calls your server, which calls the provider."],
    code=('Debug-only trust for a local proxy', '''<!-- res/xml/network_security_config.xml -->
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
    <debug-overrides>
        <trust-anchors>
            <certificates src="user" />     <!-- lets Charles/Proxyman work in debug only -->
        </trust-anchors>
    </debug-overrides>
</network-security-config>''', 'xml')),
 ],
 mistakes=[('Pinning only one certificate', 'Pin the current and a backup key.'),
           ('Shipping API secrets in BuildConfig', 'Keep secrets on the server; the app only gets short-lived tokens.'),
           ('Allowing cleartext traffic for the whole app', 'Use HTTPS everywhere; allow exceptions only per domain if unavoidable.')],
 qa=('What is certificate pinning and what is its main risk?',
     "Pinning makes the app accept a server only if its certificate's public key matches a key built into the app, which blocks man-in-the-middle attacks even with a compromised certificate authority. The main risk is lockout: if the server changes its key and the app has no matching pin, all requests fail until users update. Pinning a backup key avoids that.")),
]

DEEP['storage'] = [
X([S('Where your app can save things', [
    "**App-specific storage** (`filesDir`, `cacheDir`) is private to your app, needs no permission and is deleted on uninstall. The system may clear `cacheDir` when space is low. **Shared storage** (photos, downloads) is visible to other apps and goes through MediaStore or the Storage Access Framework."]),
  S('Pick by the shape of the data', [
    "Small settings like dark mode or \"has seen onboarding\": **DataStore**. Lists of structured items you search, sort or relate (notes, messages, orders): **Room**. Big blobs like images or PDFs: **files**, with the file path stored in Room if needed. Secrets like tokens: encrypted storage backed by the Android **Keystore**."],
    code=('Files in app-specific storage', '''suspend fun saveAvatar(ctx: Context, bytes: ByteArray): File = withContext(Dispatchers.IO) {
    val file = File(ctx.filesDir, "avatar.jpg")       // private, no permission needed
    file.outputStream().use { it.write(bytes) }
    file
}

fun clearThumbCache(ctx: Context) = File(ctx.cacheDir, "thumbs").deleteRecursively()''')),
  S('Always off the main thread', [
    "Reading or writing disk can take tens of milliseconds, or much more on a slow phone. Room refuses to run queries on the main thread by default. For files, wrap the work in `withContext(Dispatchers.IO)`. Turn on `StrictMode` in debug builds to catch accidental disk access on the main thread."]),
 ],
 mistakes=[('Storing a big JSON list in SharedPreferences', 'Use Room for lists; Preferences are loaded fully into memory.'),
           ('Saving images inside the database as blobs', 'Store files on disk and keep the path in the database.'),
           ('Keeping auth tokens in plain text', 'Encrypt them with a Keystore-backed key.')],
 qa=('How would you choose between Room, DataStore and files?',
     "I look at the data. Small key-value settings go in DataStore. Structured records that I need to query, sort, filter or observe go in Room. Large binary content like images or downloads goes in files in app-specific storage, with metadata in Room if I need to search it.")),

X([S('How Room fits on top of SQLite', [
    "SQLite is the database built into Android. Using it directly means writing SQL strings, cursor loops and lots of boilerplate. Room is a layer on top: you describe tables as Kotlin classes, write queries in annotations, and Room generates the code at build time and checks your SQL against the tables."]),
  S('The three building blocks', [
    "An `@Entity` is a table; each property is a column. A `@Dao` is an interface with query methods. The `@Database` class lists entities, the version number, and gives you DAOs. Create one database instance for the whole app (usually through DI), because opening it is expensive."],
    code=('Relations with @Relation', '''@Entity data class Author(@PrimaryKey val id: Long, val name: String)
@Entity(foreignKeys = [ForeignKey(Author::class, ["id"], ["authorId"], onDelete = ForeignKey.CASCADE)],
        indices = [Index("authorId")])
data class Book(@PrimaryKey val id: Long, val authorId: Long, val title: String)

data class AuthorWithBooks(
    @Embedded val author: Author,
    @Relation(parentColumn = "id", entityColumn = "authorId") val books: List<Book>
)

@Dao interface LibraryDao {
    @Transaction                                 // runs both queries consistently
    @Query("SELECT * FROM Author")
    fun authorsWithBooks(): Flow<List<AuthorWithBooks>>
}''')),
  S('Observing changes', [
    "When a DAO method returns `Flow`, Room watches the tables used in the query. Any insert, update or delete on those tables makes the query run again and emit fresh results. That is how the UI updates by itself when data changes."]),
 ],
 mistakes=[('Creating a new database instance in each Activity', 'Use one instance for the app, provided by DI.'),
           ('Missing indices on foreign keys and filter columns', 'Add `indices` for faster queries.'),
           ('Using `allowMainThreadQueries()`', 'Use suspend functions and Flow instead.')],
 qa=('How does a Room Flow know when to emit new data?',
     "Room tracks which tables each query reads. It registers an observer on those tables through its InvalidationTracker. When any write changes one of those tables, the tracker marks the query invalid, Room runs it again and the Flow emits the new result. Writes to unrelated tables do not trigger it.")),

X([S('Why migrations exist', [
    "Your users already have a database file on their phones with the old shape. When you add a column, the new app version expects the new shape. A migration is the set of steps that changes the old file into the new shape **without losing user data**."]),
  S('Automatic migrations', [
    "For simple changes (new table, new column with a default), Room can write the migration for you. Turn on `exportSchema` so Room saves a JSON copy of each version's schema, then list `AutoMigration(from = 2, to = 3)`. For renames and deletions, add a small spec class so Room knows what you meant."],
    code=('Auto migration with a rename', '''@RenameColumn(tableName = "notes", fromColumnName = "text", toColumnName = "body")
class Migration3To4 : AutoMigrationSpec

@Database(
    entities = [NoteEntity::class],
    version = 4,
    autoMigrations = [
        AutoMigration(from = 2, to = 3),
        AutoMigration(from = 3, to = 4, spec = Migration3To4::class)
    ]
)
abstract class AppDb : RoomDatabase()''')),
  S('Testing migrations', [
    "`MigrationTestHelper` creates a database at an old version, runs your migrations and checks the result against the exported schema. Test from **every** version your users might still have, not only the last one, because people skip updates."]),
 ],
 mistakes=[('Changing an entity without bumping the version', 'Room crashes at startup; bump the version and add a migration.'),
           ('Using `fallbackToDestructiveMigration()` for user data', 'Only use it for caches you can rebuild.'),
           ('Not committing exported schema files', 'Commit them; migration tests and auto migrations need them.')],
 qa=('A user jumps from app version 1 straight to version 5. How does Room handle it?',
     "Room finds a path of migrations from 1 to 5, such as 1 to 2, 2 to 3, 3 to 4 and 4 to 5, and runs them in order. If any step is missing it throws, unless destructive fallback is enabled. You can also provide a direct 1-to-5 migration, which Room prefers because it is shorter.")),

X([S('Why DataStore replaced SharedPreferences', [
    "SharedPreferences reads the whole file into memory and has a synchronous API, so reads on the main thread can freeze the app. `apply()` writes in the background but can still block the main thread while the app is pausing. Errors are silently ignored.",
    "DataStore is built on coroutines and Flow. Reads are a Flow, writes are suspend functions run in a transaction, and errors are reported as exceptions you can handle."]),
  S('Preferences DataStore vs Proto DataStore', [
    "**Preferences DataStore** stores simple keys and values, like SharedPreferences, with typed keys. **Proto DataStore** stores one typed object defined with a schema (Protocol Buffers), so you get type safety for a whole settings object."],
    code=('Migrating from SharedPreferences', '''val Context.settings by preferencesDataStore(
    name = "settings",
    produceMigrations = { ctx -> listOf(SharedPreferencesMigration(ctx, "old_prefs")) }
)

val ONBOARDED = booleanPreferencesKey("onboarded")

val onboarded: Flow<Boolean> = context.settings.data.map { it[ONBOARDED] ?: false }

suspend fun finishOnboarding() = context.settings.edit { it[ONBOARDED] = true }''')),
  S('Reading a value once', [
    "Sometimes you need the current value only once, for example at startup. Use `settings.data.first()` inside a coroutine. Avoid `runBlocking` on the main thread to read it; show a splash state while it loads instead."]),
 ],
 mistakes=[('Creating DataStore inside a function each time', 'Declare it once at top level with the delegate.'),
           ('Storing lists of records in DataStore', 'Use Room for lists and relations.'),
           ('Reading DataStore with `runBlocking` on Main', 'Use `first()` in a coroutine and show a loading state.')],
 qa=('What problems does DataStore solve compared to SharedPreferences?',
     "It never blocks the main thread because reads are Flows and writes are suspend functions on a background dispatcher. Updates are transactional, so you do not get half-written values. Errors surface as exceptions instead of being silently ignored, and Proto DataStore adds type safety for whole objects.")),

X([S('What offline-first means', [
    "The app works with whatever data it has, even with no internet. Reading always comes from the local database. Writes are saved locally first and the UI updates at once. A background job sends the changes to the server when possible."]),
  S('The outbox pattern', [
    "Keep a table of pending changes (an **outbox**). Each row says what to send, like \"mark note 42 as done\". A WorkManager job reads the outbox, sends each change, and deletes the row on success. If the app is killed or the phone has no signal, the rows wait safely and are sent later."],
    code=('Saving locally and queueing', '''suspend fun toggleDone(id: String) {
    db.withTransaction {
        val note = dao.get(id)
        dao.update(note.copy(done = !note.done, updatedAt = now()))
        outbox.insert(PendingChange(noteId = id, op = "toggle_done", createdAt = now()))
    }
    syncScheduler.requestSync()        // unique WorkManager job with a network constraint
}''')),
  S('Conflicts', [
    "Two devices can change the same item while offline. The simplest rule is **last write wins**: keep whichever change has the newer timestamp, using server time if possible. For important data, keep a version number and ask the user, or merge field by field."]),
 ],
 mistakes=[('Updating the UI only after the server confirms', 'Update the local database first; sync in the background.'),
           ('Using device time to resolve conflicts', 'Prefer server timestamps or version numbers.'),
           ('Starting a sync job for every single change', 'Use unique work so many changes share one sync run.')],
 qa=('How would you build a notes app that works offline and syncs across devices?',
     "Room is the source of truth and the UI observes it. Edits are written to Room and an outbox table in one transaction. A unique WorkManager job with a network constraint pushes outbox items, then pulls server changes since the last sync token and writes them to Room. Conflicts are resolved with server-side version numbers, using last-write-wins for simple fields.")),
]
