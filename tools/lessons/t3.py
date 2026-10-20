from common import L, A, D

TOPICS = {}

TOPICS['di'] = dict(lessons=[
L('Introduction',
  ["Dependency injection means a class receives its dependencies instead of creating them. That makes classes testable (pass a fake) and swappable (another implementation), and it centralises object lifetimes.",
   "On Android the standard tool is **Hilt**, built on **Dagger**. Dagger generates the wiring code at compile time, so errors show up during the build instead of as crashes at runtime."],
  ['Constructor injection first', 'Compile-time graph (Dagger/Hilt) vs runtime service locator (Koin)', 'Scopes control lifetime', 'DI makes testing easy'],
  'Constructor injection',
  '''class CheckoutViewModel @Inject constructor(
    private val cart: CartRepository,
    private val payments: PaymentGateway
) : ViewModel()

// Without DI the class would build its own collaborators:
// private val payments = RazorpayGateway(OkHttpClient())   // untestable, hard-wired''',
  'Contrast Hilt (compile-time, safer, slower builds) with Koin (runtime, simpler, errors at runtime). A balanced answer scores better than a favourite.'),
L('Hilt setup and components',
  ["Annotate the `Application` with `@HiltAndroidApp`, Android classes with `@AndroidEntryPoint`, and ViewModels with `@HiltViewModel`. Hilt provides a fixed hierarchy of **components**, each tied to an Android lifetime.",
   "`SingletonComponent` lives as long as the app, `ActivityRetainedComponent` survives rotation, `ViewModelComponent` matches a ViewModel, and `ActivityComponent` and `FragmentComponent` match their owners. A child component can use bindings from its parents, not the other way round."],
  ['@HiltAndroidApp, @AndroidEntryPoint, @HiltViewModel', 'Component hierarchy and lifetimes', '@InstallIn picks the component', 'hiltViewModel() in Compose'],
  'Wiring a ViewModel',
  '''@HiltAndroidApp
class App : Application()

@HiltViewModel
class FeedViewModel @Inject constructor(
    private val repo: FeedRepository,
    savedState: SavedStateHandle            // provided by Hilt automatically
) : ViewModel()

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        setContent { FeedScreen(vm = hiltViewModel()) }
    }
}''',
  'Know that SavedStateHandle and @ApplicationContext are available without writing a module. Interviewers like that detail.'),
L('Modules: @Provides and @Binds',
  ["Use a module when you cannot use constructor injection: interfaces, third-party classes (Retrofit, OkHttp, Room) or objects that need configuration.",
   "`@Binds` maps an interface to its implementation and generates less code; it must be abstract. `@Provides` runs your code to build an instance. Put both kinds in separate modules, or put `@Provides` in a companion object."],
  ['@Binds for interface → implementation', '@Provides for builders and third-party types', '@InstallIn(SingletonComponent::class)', 'Prefer constructor injection whenever possible'],
  'Network module',
  '''@Module
@InstallIn(SingletonComponent::class)
abstract class DataModule {
    @Binds abstract fun bindFeedRepo(impl: FeedRepositoryImpl): FeedRepository
}

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides @Singleton
    fun okHttp(auth: AuthInterceptor): OkHttpClient =
        OkHttpClient.Builder().addInterceptor(auth).build()

    @Provides @Singleton
    fun retrofit(client: OkHttpClient): Retrofit = Retrofit.Builder()
        .baseUrl(BuildConfig.API_URL)
        .client(client)
        .addConverterFactory(MoshiConverterFactory.create())
        .build()
}''',
  'Why is @Binds better than @Provides for interfaces? It generates no factory method body, so builds are faster and the generated code smaller.'),
L('Scopes and qualifiers',
  ["Without a scope annotation, Hilt creates a **new instance every time** one is requested. A scope (`@Singleton`, `@ActivityRetainedScoped`, `@ViewModelScoped`) makes one instance per component. Scope only what must be shared or is expensive, because scoped objects stay in memory for the component's lifetime.",
   "**Qualifiers** distinguish two bindings of the same type, for example two OkHttpClients or two dispatchers."],
  ['Unscoped = new instance each time', 'Scope annotation must match the component', 'Custom @Qualifier annotations', '@Named works but is not type-safe'],
  'Qualifying dispatchers',
  '''@Qualifier @Retention(AnnotationRetention.BINARY) annotation class IoDispatcher
@Qualifier @Retention(AnnotationRetention.BINARY) annotation class DefaultDispatcher

@Module @InstallIn(SingletonComponent::class)
object DispatchersModule {
    @Provides @IoDispatcher fun io(): CoroutineDispatcher = Dispatchers.IO
    @Provides @DefaultDispatcher fun cpu(): CoroutineDispatcher = Dispatchers.Default
}

class ImageRepo @Inject constructor(@IoDispatcher private val io: CoroutineDispatcher)''',
  'Over-scoping to @Singleton is a common mistake. Mention it as a memory concern when asked about scopes.'),
L('Testing and assisted injection',
  ["In instrumented tests, annotate the test with `@HiltAndroidTest`, use `HiltAndroidRule`, and replace production modules with `@TestInstallIn`. For plain unit tests you usually do not need Hilt at all: call the constructor with fakes.",
   "When an object needs both injected dependencies and a runtime value (an ID), use **assisted injection** with `@AssistedInject` and an `@AssistedFactory`."],
  ['Unit tests: just call the constructor', '@HiltAndroidTest and @TestInstallIn', '@AssistedInject for runtime parameters', 'Fakes over mocks where possible'],
  'Assisted injection',
  '''class Downloader @AssistedInject constructor(
    private val api: FileApi,
    @Assisted private val fileId: String
) { suspend fun run() = api.download(fileId) }

@AssistedFactory
interface DownloaderFactory { fun create(fileId: String): Downloader }

class FilesViewModel @Inject constructor(private val factory: DownloaderFactory) : ViewModel() {
    fun download(id: String) = viewModelScope.launch { factory.create(id).run() }
}''',
  'Saying "my unit tests do not need Hilt because I use constructor injection" shows you understand why DI exists.'),
], articles=[
A('Dependency injection in Android', 'https://developer.android.com/training/dependency-injection'),
A('Dependency injection with Hilt', 'https://developer.android.com/training/dependency-injection/hilt-android'),
A('Hilt testing guide', 'https://developer.android.com/training/dependency-injection/hilt-testing'),
A('Hilt documentation (Dagger)', 'https://dagger.dev/hilt/'),
D('Dependency Injection and Hilt', '/concept_di'),
])

TOPICS['networking'] = dict(lessons=[
L('Introduction',
  ["Most Android apps talk to a REST or GraphQL backend using **Retrofit** on top of **OkHttp**. Retrofit turns an annotated interface into HTTP calls; OkHttp does the actual work: connection pooling, HTTP/2, gzip, caching and interceptors.",
   "Interviews test the full path: making calls main-safe, handling errors and timeouts, authentication with token refresh, caching, and security."],
  ['Retrofit builds requests, OkHttp executes them', 'Suspend functions in Retrofit interfaces', 'One shared OkHttpClient', 'Serialization: Moshi, kotlinx.serialization, Gson'],
  'A Retrofit API',
  '''interface ShopApi {
    @GET("products")
    suspend fun products(@Query("page") page: Int, @Query("size") size: Int = 20): ProductPage

    @POST("orders")
    suspend fun placeOrder(@Body order: OrderRequest): Response<OrderResponse>
}

val api = retrofit.create<ShopApi>()''',
  'Share one OkHttpClient across the app (use newBuilder() for variants). Each client has its own connection pool and thread pool.'),
L('Interceptors',
  ["An interceptor sees every request and response. **Application interceptors** (`addInterceptor`) run once per call and see the final response. **Network interceptors** (`addNetworkInterceptor`) run for each network round-trip, including redirects, and see what goes on the wire.",
   "Typical uses: adding auth and common headers, logging (debug builds only), request IDs, and rewriting cache headers."],
  ['Application vs network interceptors', 'chain.proceed(request) exactly once', 'HttpLoggingInterceptor only in debug', 'Order of interceptors matters'],
  'An auth header interceptor',
  '''class AuthInterceptor @Inject constructor(private val tokens: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request().newBuilder()
            .header("Authorization", "Bearer ${tokens.access()}")
            .header("X-App-Version", BuildConfig.VERSION_NAME)
            .build()
        return chain.proceed(req)
    }
}''',
  'Never log Authorization headers or bodies in release builds. Mention redactHeader on the logging interceptor.'),
L('Authentication and token refresh',
  ["When an access token expires, the server returns 401. OkHttp's **Authenticator** is called on a 401 and can return a new request with a refreshed token, or null to give up.",
   "With many parallel requests, all of them can hit 401 at once. Synchronise the refresh so only one call refreshes and the others reuse the new token, and stop retrying after a limit to avoid loops."],
  ['Authenticator handles 401', 'Synchronise refresh across concurrent requests', 'Retry limit via priorResponse', 'Store tokens securely (EncryptedSharedPreferences or DataStore + Keystore)'],
  'A single-flight token refresh',
  '''class TokenAuthenticator @Inject constructor(
    private val store: TokenStore,
    private val authApi: AuthApi
) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.priorResponse != null) return null          // already retried once
        synchronized(this) {
            val sent = response.request.header("Authorization")?.removePrefix("Bearer ")
            val current = store.access()
            val token = if (current != sent) current                // another thread refreshed
                        else authApi.refreshBlocking(store.refresh())?.also(store::save)?.access
                             ?: return null.also { store.clear() } // refresh failed: log out
            return response.request.newBuilder().header("Authorization", "Bearer $token").build()
        }
    }
}''',
  'The "compare the token we sent with the current one" check is the detail that shows you have built this in production.'),
L('Errors, retries and caching',
  ["Model results explicitly: success, HTTP error (4xx/5xx with a body), network error (no connection, timeout) and unexpected errors. Retry only idempotent requests and transient failures, with exponential backoff and jitter.",
   "OkHttp has an HTTP cache that honours `Cache-Control`. Give it a `Cache` directory and size, and let the server's headers decide freshness. For offline-first, cache in Room instead."],
  ['Typed results instead of throwing everywhere', 'Timeouts: connect, read, write, call', 'Retry with backoff only for idempotent calls', 'OkHttp Cache and Cache-Control', 'ETag / If-None-Match'],
  'A safe call wrapper',
  '''sealed interface NetResult<out T> {
    data class Ok<T>(val value: T) : NetResult<T>
    data class Http(val code: Int, val body: String?) : NetResult<Nothing>
    data class Network(val cause: IOException) : NetResult<Nothing>
}

suspend fun <T> safeCall(block: suspend () -> T): NetResult<T> = try {
    NetResult.Ok(block())
} catch (e: HttpException) {
    NetResult.Http(e.code(), e.response()?.errorBody()?.string())
} catch (e: IOException) {
    NetResult.Network(e)
}   // CancellationException is not caught, so cancellation still works''',
  'Mention exponential backoff with jitter: without jitter, all clients retry at the same moment and overload the server again.'),
L('Security',
  ["All traffic should use HTTPS; Android blocks cleartext by default from API 28. A **network security config** controls trusted certificates, debug overrides and cleartext exceptions.",
   "**Certificate pinning** (OkHttp `CertificatePinner`) defends against compromised CAs but can lock users out if certificates rotate, so pin backup keys and plan the rotation. Never put secrets in the APK; anything shipped can be extracted."],
  ['HTTPS only; cleartext blocked by default', 'network_security_config.xml', 'Certificate pinning and its risks', 'No API secrets in the app; use a backend'],
  'Certificate pinning',
  '''val pinner = CertificatePinner.Builder()
    .add("api.example.com", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")  // current key
    .add("api.example.com", "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=")  // backup key
    .build()

val client = OkHttpClient.Builder().certificatePinner(pinner).build()''',
  'Always say "with a backup pin" when you mention pinning. Pinning a single key is how apps break on certificate rotation day.'),
], articles=[
A('Retrofit', 'https://square.github.io/retrofit/'),
A('OkHttp interceptors', 'https://square.github.io/okhttp/features/interceptors/'),
A('OkHttp caching', 'https://square.github.io/okhttp/features/caching/'),
A('Network security configuration', 'https://developer.android.com/privacy-and-security/security-config'),
D('OkHttp and networking', '/concept_networking'),
D('Design a networking SDK', '/sysdesign_networkingsdk'),
])

TOPICS['storage'] = dict(lessons=[
L('Introduction',
  ["Android gives you several places to keep data: **Room** (SQLite) for structured, queryable data; **DataStore** for small key-value settings; files in app-specific storage for blobs; and MediaStore or the Storage Access Framework for shared files.",
   "Picking the right one, keeping disk work off the main thread, and migrating schemas safely are the core interview themes."],
  ['Room for relational data', 'DataStore replaces SharedPreferences', 'App-specific vs shared storage', 'All disk I/O off the main thread'],
  'Choosing storage',
  '''// Structured, queryable, observable         -> Room
// Small settings (theme, onboarding seen)    -> Preferences DataStore
// Typed settings object                      -> Proto DataStore
// Images, downloads, caches                  -> context.filesDir / cacheDir
// User-visible photos and documents          -> MediaStore / SAF''',
  'If asked "SharedPreferences vs DataStore", say: DataStore is async, uses Flow, handles errors and is safe from main-thread disk I/O.', lang='text'),
L('Room fundamentals',
  ["Room has three parts: `@Entity` (table), `@Dao` (queries) and `@Database` (holder). SQL queries are checked at **compile time**, which catches typos and missing columns before the app runs.",
   "DAO methods can be `suspend` for one-shot work or return `Flow` to observe the table: Room re-emits whenever the tables used by the query change."],
  ['@Entity, @Dao, @Database', 'Compile-time query checking', 'suspend for one-shot, Flow for observation', '@Upsert, @Transaction, @Relation', 'TypeConverters for custom types'],
  'Entity, DAO and an observable query',
  '''@Entity(tableName = "notes", indices = [Index("updatedAt")])
data class NoteEntity(
    @PrimaryKey val id: String,
    val title: String,
    val body: String,
    val updatedAt: Long
)

@Dao
interface NoteDao {
    @Query("SELECT * FROM notes ORDER BY updatedAt DESC")
    fun observeAll(): Flow<List<NoteEntity>>

    @Upsert suspend fun upsert(note: NoteEntity)

    @Query("DELETE FROM notes WHERE id = :id") suspend fun delete(id: String)
}''',
  'Add indices for columns you filter or sort on. "How would you speed up this query?" usually wants an index.'),
L('Migrations',
  ["Every schema change needs a database version bump and a migration. Without one, Room throws at startup, or wipes data if you used `fallbackToDestructiveMigration()`, which is rarely acceptable for user data.",
   "Prefer **auto-migrations** for simple changes (adding a column or table), write a manual `Migration` for complex ones, and export schemas so you can test every path with `MigrationTestHelper`."],
  ['Bump version on every schema change', 'AutoMigration with specs for renames and deletes', 'Manual Migration with SQL', 'exportSchema = true and migration tests', 'Destructive fallback only for caches'],
  'Auto and manual migrations',
  '''@Database(
    entities = [NoteEntity::class],
    version = 3,
    autoMigrations = [AutoMigration(from = 1, to = 2)],   // added a column
    exportSchema = true
)
abstract class AppDb : RoomDatabase() { abstract fun notes(): NoteDao }

val MIGRATION_2_3 = object : Migration(2, 3) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0")
    }
}''',
  'Mention testing migrations from every old version that users may still have, not only the previous one.'),
L('DataStore',
  ["**Preferences DataStore** stores key-value pairs; **Proto DataStore** stores a typed object defined by a schema. Both expose data as a `Flow` and write transactionally with `edit` or `updateData`.",
   "Create one DataStore instance per file (use the `preferencesDataStore` delegate at top level). Two instances for the same file throw an exception."],
  ['Preferences vs Proto DataStore', 'Reads are Flow, writes are suspend', 'Single instance per file', 'Migrating from SharedPreferences', 'Not for large or relational data'],
  'Preferences DataStore',
  '''val Context.settings by preferencesDataStore(name = "settings")

object Keys { val DARK = booleanPreferencesKey("dark_mode") }

class SettingsRepo(private val ctx: Context) {
    val darkMode: Flow<Boolean> = ctx.settings.data
        .catch { if (it is IOException) emit(emptyPreferences()) else throw it }
        .map { it[Keys.DARK] ?: false }

    suspend fun setDark(on: Boolean) = ctx.settings.edit { it[Keys.DARK] = on }
}''',
  'SharedPreferences.apply() still blocks the main thread during onPause in some cases. That is a concrete reason to move to DataStore.'),
L('Offline-first and sync',
  ["In an offline-first app, the UI reads only from the local database; writes go to the database first and are synced to the server later. Track pending changes (a `syncState` column or an outbox table) and push them with **WorkManager** when there is a network connection.",
   "Plan for conflicts: last-write-wins with server timestamps is simple; field-level merging or versions are safer when users edit the same data on several devices."],
  ['Local database is the source of truth', 'Outbox / pending-change table', 'WorkManager with network constraints', 'Conflict resolution strategies', 'Paging 3 with RemoteMediator for large lists'],
  'Queueing a sync with WorkManager',
  '''class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result = try {
        repo.pushPendingChanges()
        repo.pullUpdates()
        Result.success()
    } catch (e: IOException) {
        Result.retry()                       // WorkManager applies backoff
    }
}

val request = OneTimeWorkRequestBuilder<SyncWorker>()
    .setConstraints(Constraints(requiredNetworkType = NetworkType.CONNECTED))
    .build()
WorkManager.getInstance(ctx).enqueueUniqueWork("sync", ExistingWorkPolicy.KEEP, request)''',
  'Use unique work so repeated triggers do not stack up duplicate syncs.'),
], articles=[
A('Save data in a local database using Room', 'https://developer.android.com/training/data-storage/room'),
A('Migrate your Room database', 'https://developer.android.com/training/data-storage/room/migrating-db-versions'),
A('DataStore', 'https://developer.android.com/topic/libraries/architecture/datastore'),
A('Build an offline-first app', 'https://developer.android.com/topic/architecture/data-layer/offline-first'),
A('Data and file storage overview', 'https://developer.android.com/training/data-storage'),
D('Room and SQLite', '/concept_room'),
D('Design an offline-first news app', '/sysdesign_offlinenews'),
])

TOPICS['buildtools'] = dict(lessons=[
L('Introduction',
  ["Gradle turns source code and resources into an APK or App Bundle. The Android Gradle Plugin (AGP) adds Android tasks: resource merging, D8 dexing, R8 shrinking and signing.",
   "Interviewers ask about build configuration (variants, flavours), dependency management, shrinking and obfuscation, and how to make builds faster in large projects."],
  ['Gradle phases: initialization, configuration, execution', 'Kotlin DSL (build.gradle.kts)', 'AAB vs APK', 'Version catalogs'],
  'A minimal module build file',
  '''plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "io.droidly.app"
    compileSdk = 35
    defaultConfig {
        applicationId = "io.droidly.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 42
        versionName = "2.3.0"
    }
}''',
  'Explain compileSdk vs targetSdk vs minSdk in one line each. It is asked in almost every Android build question.'),
L('Build types and product flavours',
  ["**Build types** describe how you build (`debug`, `release`, maybe `benchmark`); **product flavours** describe what you build (`free`/`paid`, `dev`/`prod`). Gradle combines them into **build variants** such as `prodRelease`.",
   "Each variant can have its own source set (`src/prod/`), resources, `BuildConfig` fields and application ID suffix, so dev and prod builds can be installed side by side."],
  ['buildTypes vs productFlavors', 'flavorDimensions', 'Variant source sets', 'buildConfigField and resValue', 'applicationIdSuffix'],
  'Environments as flavours',
  '''android {
    flavorDimensions += "env"
    productFlavors {
        create("dev")  {
            dimension = "env"
            applicationIdSuffix = ".dev"
            buildConfigField("String", "API_URL", "\\"https://dev.api.example.com/\\"")
        }
        create("prod") {
            dimension = "env"
            buildConfigField("String", "API_URL", "\\"https://api.example.com/\\"")
        }
    }
    buildFeatures { buildConfig = true }
}''',
  'Never put real secrets in buildConfigField. They end up as plain strings in the APK.'),
L('Dependencies and version catalogs',
  ["`implementation` hides a dependency from modules that depend on yours, so changes do not force them to recompile. `api` exposes it. Prefer `implementation` for faster incremental builds.",
   "A **version catalog** (`gradle/libs.versions.toml`) keeps all versions in one place with type-safe accessors. **BOMs** (Compose, Firebase, OkHttp) align versions across a library family."],
  ['implementation vs api vs compileOnly', 'libs.versions.toml', 'BOMs for aligned versions', 'Resolving version conflicts'],
  'A version catalog',
  '''# gradle/libs.versions.toml
[versions]
kotlin = "2.0.21"
compose-bom = "2024.10.01"

[libraries]
compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "compose-bom" }
compose-ui = { group = "androidx.compose.ui", name = "ui" }

[plugins]
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }

# build.gradle.kts
# implementation(platform(libs.compose.bom))
# implementation(libs.compose.ui)''',
  'Explaining why implementation speeds up builds (smaller recompilation surface) shows you understand Gradle, not just its syntax.', lang='toml'),
L('R8: shrinking and obfuscation',
  ["In release builds, **R8** removes unused code (tree shaking), optimises and inlines it, and renames classes and members to short names. `isShrinkResources` also removes unused resources.",
   "Code reached only by reflection (JSON models, some DI or serialization libraries) can be removed or renamed by mistake. Keep rules (`-keep`) tell R8 what to leave alone; many libraries ship their own consumer rules. Upload the `mapping.txt` file to deobfuscate crash stack traces."],
  ['isMinifyEnabled and isShrinkResources', 'proguard-rules.pro and keep rules', 'Reflection is the usual cause of release-only crashes', 'mapping.txt for crash deobfuscation', 'Test the release build'],
  'Release configuration',
  '''android {
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
// proguard-rules.pro
// -keep class io.droidly.api.model.** { *; }   # models parsed via reflection''',
  'A crash that only happens in release is almost always R8 plus reflection. Say how you would find it: a minified debug build and the mapping file.'),
L('Faster builds',
  ["Large projects get slow builds from three things: configuration time, too much recompilation, and annotation processing. Fixes include the **configuration cache**, the **build cache**, modularisation with `implementation` dependencies, and **KSP** instead of kapt.",
   "Measure before optimising: use a **build scan** or the Build Analyzer in Android Studio to see which tasks take the time."],
  ['Configuration cache and build cache', 'KSP over kapt', 'Modularisation for parallel and incremental builds', 'Non-transitive R classes', 'Build Analyzer / build scans'],
  'gradle.properties for speed',
  '''org.gradle.parallel=true
org.gradle.caching=true
org.gradle.configuration-cache=true
org.gradle.jvmargs=-Xmx4g -XX:+UseParallelGC
android.nonTransitiveRClass=true
kotlin.incremental=true''',
  'Quote a before and after ("clean build 6 min to 3 min") if you have one. Numbers make build answers credible.', lang='properties'),
], articles=[
A('Configure your build', 'https://developer.android.com/build'),
A('Configure build variants', 'https://developer.android.com/build/build-variants'),
A('Shrink, obfuscate and optimize your app', 'https://developer.android.com/build/shrink-code'),
A('Optimize your build speed', 'https://developer.android.com/build/optimize-your-build'),
A('Migrate your build to version catalogs', 'https://developer.android.com/build/migrate-to-catalogs'),
])
