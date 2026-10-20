from common import L, A, D

TOPICS = {}

TOPICS['performance'] = dict(lessons=[
L('Introduction',
  ["Performance questions are about what the user feels: how fast the app starts, whether scrolling is smooth, whether it runs out of memory, and how much battery it uses.",
   "The winning approach is always the same: **measure, find the bottleneck, fix it, measure again**, in a release build on a real low-end device."],
  ['Startup time', 'Jank and frame time', 'Memory and leaks', 'Battery and background work', 'Measure in release builds'],
  'Measuring startup with Macrobenchmark',
  '''@RunWith(AndroidJUnit4::class)
class StartupBenchmark {
    @get:Rule val rule = MacrobenchmarkRule()

    @Test fun coldStartup() = rule.measureRepeated(
        packageName = "io.droidly.app",
        metrics = listOf(StartupTimingMetric()),
        iterations = 10,
        startupMode = StartupMode.COLD
    ) {
        pressHome()
        startActivityAndWait()
    }
}''',
  'Interviewers distrust "it felt faster". Always say what you measured, with what tool, on which device.'),
L('App startup',
  ["**Cold** start creates the process, the Application and the first Activity; **warm** start reuses the process; **hot** start only brings the Activity to the front. Time to initial display (TTID) and time to full display (TTFD, reported with `reportFullyDrawn`) are the key metrics.",
   "Common wins: move work out of `Application.onCreate`, initialise SDKs lazily or in the background, avoid disk and network on the main thread, and ship **Baseline Profiles** so hot code paths are compiled ahead of time."],
  ['Cold, warm and hot start', 'TTID and TTFD', 'Lazy SDK initialisation and App Startup library', 'Baseline Profiles', 'Splash screen API'],
  'Lazy initialisation instead of Application.onCreate',
  '''class App : Application() {
    override fun onCreate() {
        super.onCreate()
        // Only what the first frame truly needs
        initCrashReporting()
        appScope.launch(Dispatchers.Default) {
            initAnalytics()          // not needed for the first frame
            warmImageCache()
        }
    }
}''',
  'Baseline Profiles can improve startup and early interactions substantially, especially for Compose apps. Mention them in any startup answer.'),
L('Rendering and jank',
  ["At 60 Hz each frame has about 16 ms; at 120 Hz about 8 ms. A frame that misses its deadline is **jank**. Causes include heavy work on the main thread, deep or over-measured layouts, overdraw, large bitmaps and garbage-collection pauses.",
   "Find it with **Perfetto** / system traces, the JankStats library, and the Profileable release build. In RecyclerView, use `DiffUtil` / `ListAdapter`, stable IDs and fixed sizes; in Compose, avoid unnecessary recompositions."],
  ['Frame budget: 16 ms / 8 ms', 'Main-thread work and StrictMode', 'Layout depth and overdraw', 'DiffUtil and ListAdapter', 'Perfetto and JankStats'],
  'ListAdapter with DiffUtil',
  '''class ProductAdapter : ListAdapter<ProductUi, ProductVH>(Diff) {
    object Diff : DiffUtil.ItemCallback<ProductUi>() {
        override fun areItemsTheSame(a: ProductUi, b: ProductUi) = a.id == b.id
        override fun areContentsTheSame(a: ProductUi, b: ProductUi) = a == b
    }
    override fun onCreateViewHolder(p: ViewGroup, t: Int) = ProductVH.inflate(p)
    override fun onBindViewHolder(h: ProductVH, i: Int) = h.bind(getItem(i))
}
// adapter.submitList(newList) diffs on a background thread''',
  'notifyDataSetChanged() redraws everything and kills animations. Saying you replaced it with ListAdapter is a quick, concrete win.'),
L('Memory and leaks',
  ["A leak happens when something long-lived (a singleton, a static field, a running coroutine or a listener) holds a reference to something short-lived, such as an Activity, View or Fragment. The garbage collector cannot free it.",
   "Detect leaks with **LeakCanary** in debug builds and the Memory Profiler. Reduce memory pressure by sizing bitmaps to their view, using an image loader with caching (Coil or Glide), and responding to `onTrimMemory`."],
  ['Common leaks: static Context, listeners, inner classes, bindings', 'LeakCanary and heap dumps', 'Bitmap sizing and image loaders', 'onTrimMemory', 'Avoid allocations in onDraw and hot loops'],
  'A classic leak and its fix',
  '''// Leak: a singleton keeps the Activity alive after rotation
object Tracker { var listener: (() -> Unit)? = null }
class HomeActivity : AppCompatActivity() {
    override fun onStart() { super.onStart(); Tracker.listener = { refreshUi() } }
    // Fix: unregister, so the singleton stops referencing this Activity
    override fun onStop() { Tracker.listener = null; super.onStop() }
}''',
  'When asked how you found a leak, describe the LeakCanary trace: the reference chain from a GC root to the leaked Activity.'),
L('Battery, network and app size',
  ["Batch and defer background work with WorkManager and constraints (charging, unmetered network). Avoid wake locks and frequent polling; use push messages (FCM) instead.",
   "Network efficiency means fewer, smaller requests: compress responses, cache, paginate and prefetch only what is likely to be needed. App size affects install conversion; ship App Bundles, enable R8 and resource shrinking, and use WebP or vector images."],
  ['WorkManager constraints instead of polling', 'FCM for server-driven updates', 'Pagination and caching', 'App Bundles and R8 for size', 'Monitor with Android vitals'],
  'Deferring work to good conditions',
  '''val upload = PeriodicWorkRequestBuilder<PhotoBackupWorker>(12, TimeUnit.HOURS)
    .setConstraints(
        Constraints(
            requiredNetworkType = NetworkType.UNMETERED,
            requiresCharging = true,
            requiresBatteryNotLow = true
        )
    )
    .build()
WorkManager.getInstance(ctx)
    .enqueueUniquePeriodicWork("photo-backup", ExistingPeriodicWorkPolicy.KEEP, upload)''',
  'Android vitals in the Play Console (ANR rate, crash rate, excessive wake-ups) is the production view interviewers expect a senior engineer to watch.'),
], articles=[
A('App startup time', 'https://developer.android.com/topic/performance/vitals/launch-time'),
A('Baseline Profiles overview', 'https://developer.android.com/topic/performance/baselineprofiles/overview'),
A('Slow rendering', 'https://developer.android.com/topic/performance/vitals/render'),
A('Manage your app\'s memory', 'https://developer.android.com/topic/performance/memory'),
A('Profile your app performance', 'https://developer.android.com/studio/profile'),
D('RecyclerView', '/concept_recyclerview'),
D('Design an image loading library', '/sysdesign_imageloader'),
])

TOPICS['hr'] = dict(lessons=[
L('Introduction',
  ["Behavioural rounds decide many offers, especially for senior roles. Interviewers want evidence of how you work: ownership, collaboration, handling conflict and failure, and the impact you had.",
   "Prepare 6 to 8 real stories from your work and reuse them across questions. One story can show ownership, a technical decision and a lesson learned."],
  ['Prepare stories, not answers', 'Show impact with numbers', 'Say "I", not only "we"', 'Be honest about failures'],
  'A story bank template',
  '''Story: Cut checkout crash rate
Situation : Checkout crashes at 1.8% after a payment SDK upgrade, peak sale in 2 weeks
Task      : I owned the fix as the payments module owner
Action    : Reproduced with a release build, found an R8 rule missing for SDK models,
            added a keep rule + a release smoke test in CI, coordinated with QA
Result    : Crash rate 1.8% -> 0.1%; no checkout incidents during the sale
Reuse for : ownership, debugging, working under pressure, process improvement''',
  'Write your stories down before the interview. Under pressure, people forget their best examples.', lang='text'),
L('The STAR method',
  ["Structure each answer as **Situation**, **Task**, **Action**, **Result**. Spend most of the time on Action (what *you* did and why) and finish with a measurable Result and what you learned.",
   "Keep answers to about two minutes. Let the interviewer ask follow-up questions instead of covering every detail up front."],
  ['Situation and Task: brief context', 'Action: your decisions and trade-offs', 'Result: numbers and outcome', 'Reflection: what you would do differently'],
  'A STAR answer in short form',
  '''Q: Tell me about a time you improved performance.

S: Our feed scrolled at ~40 fps on low-end devices; reviews mentioned lag.
T: I was asked to fix it before the next release.
A: Profiled with Perfetto, found image decoding on the main thread and full
   list refreshes. Moved to Coil with sized requests and replaced
   notifyDataSetChanged with ListAdapter + DiffUtil. Added a Macrobenchmark.
R: Jank frames dropped from 18% to 3%; the benchmark now runs in CI.''',
  'End with the result, not the action. Many candidates stop at "and then I shipped it".', lang='text'),
L('Conflict, feedback and collaboration',
  ["Expect questions such as \"tell me about a disagreement with a teammate or manager\". Show that you disagreed on the problem, not the person, used data to decide, and committed to the outcome even when it was not your proposal.",
   "For feedback questions, give a real example of feedback you received, what you changed, and how you know it worked."],
  ['Disagree on ideas with data, then commit', 'Show empathy for the other side', 'Real feedback you acted on', 'Working with product, design and backend'],
  'Structure for a disagreement answer',
  '''1. The disagreement:  Compose rewrite now vs incremental migration
2. Their view:        Faster in the long run, cleaner code
3. My view:           Risk to the Q3 launch, team not yet trained
4. How we decided:    Built one screen both ways, measured effort and bugs
5. Outcome:           Incremental migration, new screens in Compose
6. What I learned:    Prototype early instead of arguing in meetings''',
  'Never make the other person the villain. Interviewers are checking whether you are someone they want on their team.', lang='text'),
L('Ownership, failure and leadership',
  ["A failure question tests self-awareness. Pick a real mistake with real consequences, own your part plainly, and spend most of the answer on what you changed afterwards: a process, a test, a habit.",
   "Senior roles add leadership without authority: mentoring, driving a technical decision across teams, improving engineering practices, and making trade-offs between speed and quality."],
  ['A real failure, owned clearly', 'What changed afterwards', 'Mentoring and raising the bar', 'Driving decisions across teams'],
  'Turning a failure into a strong answer',
  '''Mistake : Shipped a migration that wiped local drafts for ~2% of users
Owned   : I wrote the migration and skipped testing from an older schema
Fixed   : Hotfix within 6 hours, restored drafts from server copies
Changed : Added MigrationTestHelper tests for every historic version,
          added a staged rollout rule for DB changes
Lesson  : Test the upgrade paths users actually have, not just the latest''',
  'Avoid fake failures like "I work too hard". They signal a lack of self-awareness.', lang='text'),
L('Questions to ask and closing',
  ["At the end you will be asked whether you have questions. Ask about the team's real problems: how they ship, how they measure quality, what the first 90 days look like, and what success means in this role.",
   "Use your last minute to connect your experience to their needs in one or two sentences."],
  ['Ask about the team, product and engineering practices', 'Ask what success looks like in 3 to 6 months', 'Avoid salary questions in technical rounds', 'Close with a short fit summary'],
  'Good questions to ask',
  '''- What does a typical release look like, from PR to Play Store rollout?
- How do you measure app quality today (crash rate, ANRs, performance)?
- What is the biggest technical challenge the Android team faces this year?
- What would make someone very successful in this role in six months?
- How are architecture decisions made and documented?''',
  'Questions about their release process and quality metrics show you think like an owner, not only an implementer.', lang='text'),
], articles=[
A('Behavioral interviews (Tech Interview Handbook)', 'https://www.techinterviewhandbook.org/behavioral-interview/'),
A('Amazon leadership principles', 'https://www.amazon.jobs/content/en/our-workplace/leadership-principles'),
A('STAR method', 'https://en.wikipedia.org/wiki/Situation,_task,_action,_result'),
D('Mock interview', '/mock_interview'),
])

TOPICS['sysdesign'] = dict(lessons=[
L('Introduction',
  ["Mobile system design asks you to design an app or SDK end to end in 45 to 60 minutes: requirements, architecture, data flow, offline behaviour, APIs and trade-offs. There is no single right answer; interviewers grade your reasoning and communication.",
   "Mobile rounds differ from backend ones: they focus on the client (caching, sync, battery, flaky networks, app size and lifecycle), with the backend treated mostly as an API."],
  ['Requirements first', 'High-level architecture', 'Data model and API contract', 'Offline, caching and sync', 'Trade-offs and scaling'],
  'A 45-minute plan',
  '''0-5 min   Clarify: features in scope, users, scale, offline needs, platforms
5-15 min  High-level design: screens, modules, layers, data flow diagram
15-30 min Deep dive: data model, API, caching, pagination, sync, errors
30-40 min Non-functional: performance, battery, security, testing, monitoring
40-45 min Trade-offs, what you would do next, questions''',
  'Say the time plan out loud at the start. It shows structure and lets the interviewer steer you to what they care about.', lang='text'),
L('Requirements and API design',
  ["Split requirements into **functional** (what the app does) and **non-functional** (latency, offline, battery, security, scale). Confirm scope before designing; it is fine to say which features you will leave out.",
   "Design the API contract the app needs: endpoints or GraphQL queries, cursor-based pagination, error formats, and whether to use polling, push notifications, SSE or WebSockets for real-time updates."],
  ['Functional vs non-functional requirements', 'Cursor pagination over offset', 'REST vs GraphQL vs WebSocket', 'Idempotency keys for retries'],
  'A feed API contract',
  '''GET /v1/feed?cursor=eyJpZCI6...&limit=20
200 {
  "items": [{ "id": "p_91", "author": {...}, "media": [...], "createdAt": 1729420000 }],
  "nextCursor": "eyJpZCI6InBfNzIifQ",
  "hasMore": true
}

POST /v1/posts/p_91/like
Idempotency-Key: 7f9c-...      # safe to retry on flaky networks''',
  'Cursor pagination does not skip or duplicate items when new posts arrive. Explain why offset pagination fails for feeds.', lang='text'),
L('Client architecture',
  ["Describe the layers: UI (Compose screens + ViewModels), domain (optional use cases) and data (repositories over a local database and the network). The database is the single source of truth and the UI observes it.",
   "Name the key components: image loader, pagination (Paging 3 with RemoteMediator), background sync (WorkManager), push (FCM), analytics and a feature-flag layer."],
  ['Layers and modules', 'Single source of truth', 'Paging 3 with RemoteMediator', 'Image loading and caching', 'Dependency injection'],
  'Data flow for a paged feed',
  '''@OptIn(ExperimentalPagingApi::class)
class FeedRepository(private val db: AppDb, private val api: FeedApi) {
    fun feed(): Flow<PagingData<Post>> = Pager(
        config = PagingConfig(pageSize = 20, prefetchDistance = 5),
        remoteMediator = FeedRemoteMediator(db, api),     // network -> database
        pagingSourceFactory = { db.posts().pagingSource() }  // database -> UI
    ).flow.map { page -> page.map(PostEntity::toDomain) }
}''',
  'Draw the arrow API → database → UI, never API → UI. It is the one diagram every mobile design answer should have.'),
L('Offline, sync and real time',
  ["Decide what must work offline: reading cached content, composing actions (likes, messages) that are queued and sent later. Store pending actions in an outbox table and send them with WorkManager, using idempotency keys so retries are safe.",
   "For real-time features (chat, live location), use a WebSocket while the app is in the foreground, FCM to wake the app for important events, and a sync-on-open fallback to catch up on anything missed."],
  ['Optimistic UI updates', 'Outbox pattern with WorkManager', 'Conflict resolution', 'WebSocket in foreground, FCM in background', 'Catch-up sync with a last-seen cursor'],
  'Optimistic like with an outbox',
  '''suspend fun like(postId: String) {
    db.withTransaction {
        db.posts().setLiked(postId, liked = true)              // UI updates instantly
        db.outbox().insert(OutboxOp(id = uuid(), type = "like", target = postId))
    }
    SyncWorker.enqueue(context)                                // sends when online
}
// If the server rejects it, the worker reverts the post and removes the op''',
  'Mention what happens when the server rejects a queued action. Interviewers often probe the unhappy path.'),
L('Non-functional concerns and trade-offs',
  ["Cover performance (startup, scroll, image sizes), battery (batching, constraints), security (token storage, pinning, no secrets in the app), observability (crash reporting, analytics, performance monitoring) and rollout (feature flags, staged releases).",
   "Close by naming trade-offs explicitly: what you chose, what you gave up and when you would choose differently. That is what separates senior answers."],
  ['Performance and battery budgets', 'Security and privacy', 'Monitoring: crashes, ANRs, latency', 'Feature flags and staged rollout', 'State trade-offs explicitly'],
  'Stating a trade-off clearly',
  '''Decision : WebSocket for chat while the app is open
Gain     : Sub-second delivery, typing indicators
Cost     : Battery and connection handling; must reconnect with backoff
Fallback : FCM data messages when backgrounded + sync on open
Revisit  : If most users are on poor networks, consider long polling''',
  'Practise with Droidly\'s system design walkthroughs below. Do each one out loud with a timer.', lang='text'),
], articles=[
A('Guide to app architecture', 'https://developer.android.com/topic/architecture'),
A('Build an offline-first app', 'https://developer.android.com/topic/architecture/data-layer/offline-first'),
A('Paging library overview', 'https://developer.android.com/topic/libraries/architecture/paging/v3-overview'),
A('Firebase Cloud Messaging', 'https://firebase.google.com/docs/cloud-messaging'),
D('Design a chat app', '/sysdesign_chat_hi_style'),
D('Design an Instagram-style feed', '/sysdesign_instafeed'),
D('Design an offline-first news app', '/sysdesign_offlinenews'),
D('Design a payment system', '/sysdesign_payment'),
])
