from common import X, S

DEEP = {}

DEEP['buildtools'] = [
X([S('What happens when you press Run', [
    "Gradle runs in three phases. **Initialization**: read `settings.gradle.kts` to find which modules exist. **Configuration**: run every module's `build.gradle.kts` to build a list (graph) of tasks. **Execution**: run only the tasks needed for what you asked, such as `assembleDebug`.",
    "For an Android app, those tasks compile Kotlin to JVM bytecode, convert it to Android's DEX format with **D8**, merge and compile resources with **AAPT2**, shrink the code with **R8** in release builds, package everything into an APK or App Bundle, and sign it."]),
  S('minSdk, targetSdk and compileSdk', [
    "**compileSdk** is the Android version you compile against; it decides which APIs you can call. **minSdk** is the oldest Android version that can install your app. **targetSdk** tells the system which version's behaviour your app is ready for; newer behaviour changes switch on when you raise it. Google Play requires a recent targetSdk."],
    code=('Calling a newer API safely', '''// compileSdk = 35, minSdk = 24
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
    requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)   // API 33+
}''')),
  S('APK vs App Bundle', [
    "An APK is the installable file. An **Android App Bundle** (`.aab`) is what you upload to Play; Google builds smaller APKs from it for each device, containing only that device's screen density, CPU type and language. Users download less."]),
 ],
 mistakes=[('Doing slow work (network, reading files) in build scripts', 'It runs on every sync during configuration; move it into tasks.'),
           ('Raising targetSdk without reading the behaviour changes', 'Check the release notes for that Android version and test.'),
           ('Calling new APIs without a version check', 'Guard with `Build.VERSION.SDK_INT` or use AndroidX compat helpers.')],
 qa=('What is the difference between compileSdk and targetSdk?',
     "compileSdk only affects compiling: which APIs your code can reference. targetSdk is put into the app and tells Android which version's behaviour changes your app has been tested with, so the system turns on newer rules such as permission changes. You usually keep both on the latest version.")),

X([S('Build types: how', [
    "A build type describes **how** the app is built. `debug` is debuggable, unoptimised and signed with a debug key. `release` is minified with R8, optimised and signed with your real key. You can add more, like `benchmark` (release-like but profileable) or `staging`."]),
  S('Product flavours: what', [
    "Flavours describe **what** you build: free and paid versions, or dev and prod environments. Flavours belong to **dimensions**; Gradle combines one flavour from each dimension with each build type. Two flavours times two build types gives four variants, like `devDebug` and `prodRelease`."],
    code=('Different code per flavour', '''// src/main/java/.../Config.kt          -> shared code
// src/dev/java/.../FakePayments.kt       -> only in dev builds
// src/prod/java/.../RazorpayPayments.kt  -> only in prod builds
// src/dev/res/values/strings.xml         -> app_name = "Droidly Dev"

android {
    buildTypes {
        getByName("debug") { applicationIdSuffix = ".debug" }   // install next to release
    }
}''')),
  S('Source sets', [
    "Each variant combines files from `src/main`, the flavour folder (`src/dev`), the build type folder (`src/debug`) and the combined folder (`src/devDebug`). For resources, the more specific folder wins. Classes cannot be overridden this way; put a class in each flavour folder, not in `main` too."]),
 ],
 mistakes=[('Using `if (BuildConfig.DEBUG)` branches all over the code', 'Put environment differences in flavours or config objects.'),
           ('Too many flavour dimensions', 'Each dimension multiplies variants and build time; keep it small.'),
           ('Same applicationId for dev and prod', 'Use `applicationIdSuffix` so both can be installed together.')],
 qa=('What is the difference between a build type and a product flavour?',
     "A build type controls how the app is built, such as debuggable, minified and signing config, with debug and release by default. A product flavour controls what is built, such as a free or paid version or a dev or prod backend. Gradle combines them into build variants.")),

X([S('How dependencies are resolved', [
    "When two libraries ask for different versions of the same library, Gradle picks the **highest** version by default. That is usually fine, but sometimes a newer version breaks the older user. `./gradlew :app:dependencies` shows the full tree and which version won."]),
  S('implementation vs api', [
    "With `implementation`, a dependency is private to your module: modules that depend on yours cannot see it. With `api`, it becomes part of your module's public surface. Use `api` only when your public classes expose types from that library. `implementation` means fewer modules recompile when the library changes."]),
  S('Version catalogs and BOMs', [
    "A version catalog (`gradle/libs.versions.toml`) keeps every library and version in one file, and Gradle generates accessors like `libs.retrofit`. A **BOM** (bill of materials) is a published list of versions that work together, such as the Compose BOM. You import it once with `platform()` and then add its libraries without versions."],
    code=('Using a BOM and a catalog', '''dependencies {
    implementation(platform(libs.androidx.compose.bom))   // pins all Compose versions
    implementation(libs.androidx.compose.ui)              // no version needed
    implementation(libs.androidx.compose.material3)

    implementation(libs.retrofit)
    testImplementation(libs.junit)
    debugImplementation(libs.leakcanary)                  // only in debug builds
}''')),
 ],
 mistakes=[('Using `api` everywhere "to be safe"', 'Use `implementation` unless your public API exposes the library.'),
           ('Hard-coding versions in each module', 'Keep them in the version catalog.'),
           ('Adding a whole big library for one small helper', 'Check the app size impact; copy small helpers if allowed.')],
 qa=('Why does using implementation instead of api make builds faster?',
     "With implementation, the dependency is not part of the module's public interface, so modules that depend on yours do not see it. When that library changes, Gradle only recompiles your module, not every module above it. With api, the change leaks to all consumers and causes more recompilation.")),

X([S('What R8 does, step by step', [
    "**Shrinking**: starting from entry points (Activities, Services, anything in the manifest and keep rules), R8 follows every reference and removes code nothing reaches. **Optimising**: it inlines small functions, removes dead branches and merges classes. **Obfuscating**: it renames classes and members to short names like `a.b`, which also makes the app smaller."]),
  S('Why reflection breaks', [
    "R8 only sees normal code references. If a library finds your class by its name at runtime (reflection), for example Gson creating objects from JSON field names, R8 may have renamed or removed it. The release build then crashes or returns empty objects. A `-keep` rule tells R8 to leave those classes alone. Libraries like kotlinx.serialization and Moshi codegen avoid reflection and need fewer rules."],
    code=('Keep rules and stack traces', '''# proguard-rules.pro
-keep class io.droidly.data.remote.dto.** { *; }        # DTOs read by Gson via reflection
-keepattributes Signature, *Annotation*                  # generics and annotations at runtime

# Decode an obfuscated crash locally:
# retrace mapping.txt stacktrace.txt''', 'properties')),
  S('The mapping file', [
    "R8 writes `mapping.txt`, a dictionary from short names back to real names. Upload it to Play Console and your crash reporter for every release, otherwise crash stack traces show `a.b.c()` and are almost useless."]),
 ],
 mistakes=[('Testing only debug builds before release', 'Run a minified release build; many bugs appear only there.'),
           ('Adding `-keep class ** { *; }` to fix a crash', 'That disables shrinking; keep only what reflection needs.'),
           ('Losing the mapping file for a release', 'Archive it with each build and upload it automatically in CI.')],
 qa=('The app works in debug but crashes in release with a ClassNotFoundException. What do you check?',
     "It is almost certainly R8 removing or renaming a class used by reflection. I would reproduce with a minified build, decode the stack trace with the mapping file, find which library loads the class by name, and add a narrow keep rule or switch that library to code generation instead of reflection.")),

X([S('Where build time goes', [
    "Slow builds usually come from: configuring many modules on every run, recompiling too much after a small change, annotation processors (especially kapt), and missing caches. Measure first: a **Build Scan** (`--scan`) or Android Studio's **Build Analyzer** shows which tasks and plugins take the most time."]),
  S('Caches that skip work', [
    "The **build cache** reuses task outputs from earlier builds (or from teammates and CI, with a remote cache), so tasks whose inputs did not change are not run again. The **configuration cache** saves the result of the configuration phase, so Gradle can skip running every build script on the next build."]),
  S('kapt vs KSP', [
    "kapt runs Java annotation processors on Kotlin code by first generating Java stubs for all your Kotlin classes, which is slow. **KSP** reads Kotlin code directly and is often about twice as fast. Room, Hilt and Moshi all support KSP."],
    code=('Switching Room to KSP', '''plugins {
    alias(libs.plugins.ksp)
}

dependencies {
    implementation(libs.room.runtime)
    ksp(libs.room.compiler)          // was: kapt(libs.room.compiler)
}''')),
 ],
 mistakes=[('Optimising builds without measuring', 'Use a build scan or Build Analyzer to find the slow tasks first.'),
           ('One giant app module', 'Split into modules so changes recompile less.'),
           ('Keeping kapt when every processor supports KSP', 'Move processors to KSP and remove the kapt plugin.')],
 qa=('How would you speed up a slow Android build in a large project?',
     "Measure with a build scan to find the biggest costs. Then enable the build and configuration caches, move annotation processing from kapt to KSP, use implementation instead of api, turn on non-transitive R classes, and modularise so a change touches fewer modules. In CI, add a remote build cache so developers reuse CI's outputs.")),
]

DEEP['performance'] = [
X([S('Four things users notice', [
    "**Startup**: how long until the first useful screen. **Smoothness**: whether scrolling and animations stutter. **Stability**: crashes and \"app not responding\" (ANR) dialogs. **Resource use**: battery, data and storage. Google Play's **Android vitals** tracks crash rate, ANR rate and more, and poor numbers can hurt your Play Store visibility."]),
  S('Measure the right build', [
    "Debug builds are slow on purpose: no R8, extra checks, debugging enabled. Measure a release-like build. Use a real mid- or low-end phone, because your flagship hides problems your users see."]),
  S('The tool for each job', [
    "**Macrobenchmark**: repeatable numbers for startup and scrolling in CI. **Perfetto / system trace**: a timeline that shows what every thread did, frame by frame. **Android Studio profilers**: CPU, memory and network over time. **LeakCanary**: memory leaks in debug builds. **JankStats**: jank measured on real users' devices."],
    code=('Marking your own sections in a trace', '''fun bindFeed(items: List<Post>) {
    trace("Feed.bind") {                       // androidx.tracing
        adapter.submitList(items)
    }
}
// The "Feed.bind" slice now appears in Perfetto / system traces''')),
 ],
 mistakes=[('Measuring performance in debug builds', 'Use a release or benchmark build type.'),
           ('Testing only on a flagship phone', 'Test on a low-end device too.'),
           ('Optimising without a baseline number', 'Record the current numbers first so you can prove improvement.')],
 qa=('How do you approach a "the app feels slow" complaint?',
     "First I make it specific: slow startup, janky scrolling, or a slow action. Then I reproduce it on a similar device with a release build, capture a system trace or Macrobenchmark, find the actual bottleneck in the trace, fix that one thing, and measure again to confirm the improvement. I add a benchmark in CI so it does not regress.")),

X([S('Cold, warm and hot starts', [
    "**Cold start**: the app process does not exist. Android creates it, runs `Application.onCreate`, creates the Activity and draws the first frame. This is the slowest and most important case. **Warm start**: the process exists but the Activity must be recreated. **Hot start**: the Activity is just brought back to the front."]),
  S('Where startup time goes', [
    "The usual suspects: SDKs initialised in `Application.onCreate` (analytics, ads, crash reporting all at once), content providers that libraries add to the manifest, reading disk or SharedPreferences on the main thread, a heavy first layout, and code that runs slowly because it has not been compiled yet."]),
  S('Baseline Profiles', [
    "Android compiles app code gradually as it runs. On first launches, much of your code is interpreted or JIT compiled, which is slower. A **Baseline Profile** is a list of the classes and methods used during startup and key journeys. Play ships it with the app, and Android compiles that code ahead of time at install, so the first launches are fast."],
    code=('Generating a Baseline Profile', '''@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {
    @get:Rule val rule = BaselineProfileRule()

    @Test fun generate() = rule.collect(packageName = "io.droidly.app") {
        pressHome()
        startActivityAndWait()
        device.findObject(By.res("feed")).fling(Direction.DOWN)   // a key journey
    }
}''')),
 ],
 mistakes=[('Initialising every SDK in `Application.onCreate`', 'Initialise lazily or in the background unless the first frame needs it.'),
           ('Reading SharedPreferences on the main thread at startup', 'Load settings asynchronously and show a placeholder.'),
           ('Forgetting `reportFullyDrawn()`', 'Call it when real content shows, so TTFD is measured correctly.')],
 qa=('What is a Baseline Profile and why does it help startup?',
     "It is a list of the code paths your app uses during startup and important user journeys. It is packaged with the app, and on install Android compiles those paths ahead of time to machine code. Without it, that code would be interpreted or JIT compiled on the first runs, which is slower and causes jank.")),

X([S('How a frame is drawn', [
    "To show 60 frames per second, each frame has about 16 milliseconds (8 ms at 120 Hz). On the main thread, Android handles input, runs animations, then measures, lays out and draws the views into a list of drawing commands. The **RenderThread** then sends them to the GPU. If the main thread is busy past the deadline, the frame is late and the user sees a stutter."]),
  S('Common causes of jank', [
    "Doing work on the main thread while scrolling (decoding images, parsing JSON, database calls). Layouts that are measured many times (deep nested weights, `RelativeLayout` inside `RelativeLayout`). Creating many objects in `onDraw` or `onBindViewHolder`, which triggers garbage collection. Full list reloads with `notifyDataSetChanged()`."],
    code=('Keep onBindViewHolder cheap', '''override fun onBindViewHolder(holder: PostVH, position: Int) {
    val item = getItem(position)                    // already formatted in the ViewModel
    holder.title.text = item.title
    holder.time.text = item.timeLabel               // not: DateFormat... on every bind
    holder.image.load(item.imageUrl) {              // Coil decodes off the main thread
        size(holder.image.width, holder.image.height)
    }
}''')),
  S('Finding the slow frame', [
    "Record a system trace while scrolling and look at frames marked red or yellow. Click a long frame and you see exactly which functions ran on the main thread. Adding your own `trace(\"name\") { }` sections makes this even easier to read."]),
 ],
 mistakes=[('Decoding full-size images for small thumbnails', 'Request images at the view size with an image loader.'),
           ('Formatting data in `onBindViewHolder`', 'Prepare display strings in the ViewModel.'),
           ('Using `notifyDataSetChanged()` for small updates', 'Use `ListAdapter` with `DiffUtil`.')],
 qa=('What is jank and how do you find its cause?',
     "Jank is when frames miss their deadline, about 16 ms at 60 Hz, so the screen visibly stutters. I capture a system trace with Perfetto while reproducing it on a real device, find the long frames, and look at what the main thread was doing in those frames. That usually points to a specific slow function, such as image decoding or layout.")),

X([S('How Android memory works', [
    "Each app gets a limited heap, often a few hundred MB on modern phones and much less on cheap ones. The garbage collector frees objects that nothing references anymore. If your app keeps references to objects it no longer needs, memory grows until the app slows down from constant garbage collection or crashes with `OutOfMemoryError`."]),
  S('What a leak looks like', [
    "A leak is a chain of references from something long-lived (a singleton, a static field, a running thread) to something short-lived (an Activity). The Activity is closed, but the chain keeps it, plus all its views and bitmaps, in memory. Rotate the phone a few times and you have several dead Activities stuck in memory."],
    code=('Leaking with an inner class', '''class PlayerActivity : AppCompatActivity() {
    // Inner class holds a hidden reference to PlayerActivity
    inner class Ticker : Runnable { override fun run() { updateTime(); handler.postDelayed(this, 1000) } }
    private val handler = Handler(Looper.getMainLooper())
    private val ticker = Ticker()

    override fun onStart() { super.onStart(); handler.post(ticker) }
    override fun onStop() { handler.removeCallbacks(ticker); super.onStop() }   // without this: leak
}''')),
  S('Finding leaks with LeakCanary', [
    "Add LeakCanary as a `debugImplementation` dependency. It watches destroyed Activities, Fragments and ViewModels. If one is not freed after a few seconds, it dumps the heap and shows the exact reference chain. You fix the leak by breaking the link closest to the long-lived object."]),
 ],
 mistakes=[('Registering listeners without unregistering them', 'Pair every register with an unregister in the opposite lifecycle callback.'),
           ('Keeping big bitmaps in a static cache', 'Use an image loader with a size-limited LRU memory cache.'),
           ('Ignoring LeakCanary warnings as "debug only"', 'The same leaks happen in release; fix them.')],
 qa=('How would you find and fix a memory leak?',
     "I would use LeakCanary in debug builds, or take a heap dump in the Memory Profiler after leaving the screen. LeakCanary shows the reference chain from a GC root to the leaked object. I fix it by breaking the reference at its source: unregistering a listener, clearing a binding, using applicationContext in a singleton, or stopping a callback in onStop.")),

X([S('What drains battery', [
    "The biggest costs are keeping the CPU awake (wake locks, frequent background work), using the radio (every network request wakes it up and it stays on for a while afterwards), and GPS. Small, frequent requests are worse than one larger batched request, because each one wakes the radio again."]),
  S('Doing background work kindly', [
    "Use WorkManager with constraints, such as unmetered network or charging, for work that can wait. Use push messages from the server (FCM) instead of polling every few minutes. Batch analytics events and send them together. Android's **Doze** mode and **App Standby Buckets** will limit apps that wake up too often anyway."]),
  S('Network and app size', [
    "Ask for only what you need: paginate lists, request smaller image sizes, enable gzip, and cache responses. For app size, upload App Bundles, enable R8 and resource shrinking, use vector drawables or WebP, and check the **APK Analyzer** to see what takes space."],
    code=('Batching analytics instead of sending each event', '''class AnalyticsQueue(private val dao: EventDao, private val work: WorkManager) {
    suspend fun log(event: Event) {
        dao.insert(event)                                   // cheap local write
        if (dao.count() >= 50) flushSoon()                  // send in batches
    }
    private fun flushSoon() = work.enqueueUniqueWork(
        "analytics-flush", ExistingWorkPolicy.KEEP,
        OneTimeWorkRequestBuilder<FlushWorker>()
            .setConstraints(Constraints(requiredNetworkType = NetworkType.CONNECTED)).build()
    )
}''')),
 ],
 mistakes=[('Polling the server every minute for updates', 'Use FCM to tell the app when something changed.'),
           ('Holding a wake lock "just in case"', 'Use WorkManager; it manages wake locks for you.'),
           ('Downloading full-resolution images for thumbnails', 'Request the size you display.')],
 qa=('Why is sending many small network requests bad for battery?',
     "Each request wakes the cellular radio into a high-power state, and the radio stays in that state for several seconds after the request finishes before it powers down. Many small requests keep the radio awake much longer than one batched request carrying the same data, so batching saves a lot of battery.")),
]

DEEP['hr'] = [
X([S('What the interviewer is really checking', [
    "Behind every behavioural question are a few simple questions: Can this person own a problem? Do they work well with others? Do they learn from mistakes? Will they make the team better? Your stories should answer these, even if the question does not ask them directly."]),
  S('Build a small story bank', [
    "Write down 6 to 8 real situations from your work: a hard bug you fixed, a project you led, a disagreement, a failure, a time you helped a teammate, a time you improved a process, a tight deadline. For each, note the numbers (crash rate, time saved, users affected). Then map each story to the questions it can answer."]),
  S('Make yourself visible', [
    "Teams do great work together, but the interviewer is hiring you. Say \"we\" for the team's goal, and \"I\" for what you personally decided and did. It is not bragging; it is giving them the information they need."],
    code=('Mapping stories to questions', '''Question type             -> Best story
Tell me about a challenge -> Checkout crash during sale week
A time you disagreed      -> Compose migration plan
A failure                 -> Migration that lost drafts
Leadership / mentoring    -> Onboarding two juniors to Hilt
Tight deadline            -> Shipping UPI payments in 3 weeks
Improving a process       -> Adding release smoke tests in CI''', 'text')),
 ],
 mistakes=[('Inventing stories on the spot', 'Prepare real stories beforehand and practise them aloud.'),
           ('Only saying "we did"', 'Explain your own decisions and actions.'),
           ('Giving answers without any result', 'End with a measurable outcome or a clear lesson.')],
 qa=('Tell me about yourself. How should you structure this answer?',
     "Keep it to about 90 seconds: who you are now (role, platform, years), two or three highlights with impact, for example a performance win or a feature at scale, and why this role is a good next step. It is a guided summary that sets up the stories you want them to ask about, not your full CV.")),

X([S('STAR, step by step', [
    "**Situation**: one or two sentences of context so the listener understands the stakes. **Task**: what you were responsible for. **Action**: what you did, in order, and why you chose that path. **Result**: what happened, ideally with numbers, plus what you learned."]),
  S('Spend your time on Action', [
    "A common mistake is spending a minute on background and ten seconds on what you did. Aim for roughly 15% Situation and Task, 60% Action, 25% Result and reflection. In the Action part, mention options you considered and why you picked one; that shows judgement."],
    code=('A strong answer about a hard bug', '''S: Payments failed for ~3% of users after a release, during a festival sale.
T: I was on call and owned the payments module.
A: Checked Crashlytics: all failures on Android 8 devices. Reproduced on an
   emulator, found an R8 rule missing for a new SDK model. Rolled back the
   staged rollout first to stop the damage, then shipped a hotfix with the
   keep rule and added a minified-build smoke test to CI.
R: Failures back to 0.1% within 6 hours. The CI check has caught two similar
   issues since. Lesson: always test the minified build before release.''', 'text')),
  S('Keep it short, then go deeper on request', [
    "Aim for about two minutes. The interviewer will ask follow-ups on what interests them. That conversation often matters more than the first answer, so leave room for it."]),
 ],
 mistakes=[('Rambling through the whole project history', 'Give just enough context, then move to your actions.'),
           ('Results with no numbers', 'Estimate if needed: "about 40% faster", "from 2% to 0.1%".'),
           ('Skipping what you learned', 'End with one honest lesson.')],
 qa=('Why do interviewers ask for specific past examples instead of hypothetical ones?',
     "Past behaviour is the best predictor of future behaviour. Hypothetical answers show what someone thinks they would do, while a real example shows what they actually did under real constraints, and follow-up questions can test the details. That is why STAR answers with concrete numbers are more convincing.")),

X([S('Handling disagreement', [
    "Interviewers want to see that you can disagree without damaging relationships. Show that you understood the other side, used data or a small experiment instead of opinions, and accepted the final decision even if it was not yours."]),
  S('Receiving and giving feedback', [
    "For feedback you received: what was said, how you felt honestly, what you changed, and how you know it helped. For feedback you gave: how you made it specific and kind, and focused on the work, not the person."],
    code=('Feedback you received', '''Feedback: "Your PRs are too large to review; reviews take days."
Reaction: Felt defensive at first, then checked: average PR was 1,200 lines.
Change:   Split work into stacked PRs under 300 lines, added a short
          "what to look at" note to each description.
Result:   Review time dropped from ~3 days to under 1; fewer bugs slipped through.''', 'text')),
  S('Working with other roles', [
    "Android engineers work with product managers, designers, backend engineers and QA. Good stories show you pushing back on a design that would hurt performance, agreeing an API contract early with backend, or helping QA reproduce a bug quickly."]),
 ],
 mistakes=[('Describing a colleague as difficult or wrong', 'Describe the disagreement neutrally and focus on how it was resolved.'),
           ('A story where you were simply right and won', 'Show listening, compromise and commitment.'),
           ('Feedback stories with no change', 'Explain what you did differently afterwards.')],
 qa=('Tell me about a time you disagreed with your manager.',
     "A good answer names the disagreement clearly, for example timeline versus quality, explains the manager's reasons fairly, shows how you raised your concern privately with data, and what was decided. If your view lost, say you committed fully and what you learned; if it won, show you did not make it about winning.")),

X([S('Choosing a real failure', [
    "Pick a mistake that mattered, that was clearly at least partly yours, and that taught you something lasting. It should not be a disaster that questions your basic judgement, and it should not be a fake failure. Most of the answer should be about what you changed afterwards."]),
  S('Ownership without authority', [
    "Ownership means acting like the outcome is yours even when no one told you to: noticing a rising crash rate and fixing it, writing the missing documentation, improving the release checklist. These stories are especially valued for senior roles."]),
  S('Leadership as a senior engineer', [
    "You do not need a manager title. Mentoring juniors, leading a technical decision across teams, writing a design doc others follow, or raising code quality through reviews are all leadership. Show how you influenced people and what changed because of it."],
    code=('A leadership story outline', '''Goal:     Move the app from 3 different networking stacks to one
My role:  Wrote a design doc comparing options; ran a 30-min review with 3 teams
Approach: Migrated one feature as a reference, paired with each team on theirs
Pushback: One team worried about deadlines -> agreed a later date for them
Result:   One stack in 2 quarters; 18% less networking code; fewer auth bugs''', 'text')),
 ],
 mistakes=[('Blaming others in a failure story', 'Own your part clearly, even if others contributed.'),
           ('Fake weaknesses like "I care too much"', 'Pick a real weakness and show how you manage it.'),
           ('Leadership stories that are just "I told them what to do"', 'Show how you persuaded and supported people.')],
 qa=('What is your biggest weakness?',
     "Name a real but manageable weakness relevant to work, for example taking on too much myself instead of delegating. Give a quick example of when it caused a problem, then explain the concrete system you now use to manage it, such as breaking work into tasks others can pick up, and the result. It shows self-awareness and growth.")),

X([S('Your questions are part of the interview', [
    "\"Do you have any questions?\" is your chance to learn whether you want the job, and it shows how you think. Questions about engineering practice, quality and real challenges signal that you will act like an owner."]),
  S('Good topics to ask about', [
    "How releases work and how often they ship. How they measure quality (crash rate, ANRs, performance). The biggest technical challenge this year. How decisions are made and documented. What success looks like in the first months. How the Android team works with backend and design."]),
  S('Closing strongly', [
    "In the last minute, briefly connect your experience to what you heard. For example: \"You mentioned startup time is a priority; I cut startup by 40% at my last company using Baseline Profiles and lazy SDK init, so I would love to help with that.\""],
    code=('After the interview', '''Same day:  Short thank-you message (2-3 lines), mention one topic you enjoyed
Notes:     Write down questions you were asked and where you were unsure
Next time: Turn weak answers into prepared stories''', 'text')),
 ],
 mistakes=[('Saying "No questions"', 'Prepare at least three questions for each round.'),
           ('Asking things the website already answers', 'Ask about how the team actually works.'),
           ('Discussing salary in an early technical round', 'Save compensation for the recruiter or HR conversation.')],
 qa=('What questions would you ask at the end of an Android interview?',
     "I would ask how a release goes from pull request to full rollout, how they track app quality such as crash rate, ANRs and startup time, what the biggest challenge for the Android team is this year, and what would make someone successful in this role after six months. These show I care about shipping quality software, not just writing code.")),
]

DEEP['sysdesign'] = [
X([S('What the interviewer grades', [
    "There is no single correct design. Interviewers look at how you clarify requirements, structure the problem, choose sensible components, explain trade-offs and react to new constraints. Thinking out loud is essential: a silent good design scores lower than a reasoned average one."]),
  S('How mobile design differs', [
    "Backend design is about servers and scaling to millions of requests. Mobile design is about one device with limits: unreliable networks, limited battery and memory, the app being killed at any time, slow app updates and many device types. Your design should show you handle those well."]),
  S('A repeatable framework', [
    "1) Requirements. 2) High-level architecture. 3) Data model and API. 4) Deep dive into one or two hard parts (pagination, sync, caching, real-time). 5) Non-functional concerns: performance, offline, security, testing, monitoring. 6) Trade-offs and what you would improve."],
    code=('Questions to ask in the first five minutes', '''- Which features are in scope? (feed, posting, likes, comments?)
- How many users, and how large is the content? (images, video?)
- Must it work offline? Read only, or also writes?
- Real-time updates needed? How fresh must data be?
- Which Android versions and devices? Tablets?
- Any limits: app size, battery, data usage?''', 'text')),
 ],
 mistakes=[('Jumping straight into classes and libraries', 'Clarify requirements and scope first.'),
           ('Designing the backend in detail', 'Treat the backend as an API unless asked; focus on the client.'),
           ('Staying silent while thinking', 'Talk through your reasoning and options.')],
 qa=('How do you start a mobile system design interview?',
     "I spend the first few minutes asking clarifying questions: which features are in scope, expected scale, offline needs, real-time needs and device constraints. Then I summarise the agreed scope and share my plan for the time, such as high-level design first, then deep dives into the hardest parts, so the interviewer can steer me.")),

X([S('Functional and non-functional requirements', [
    "**Functional**: what the user can do, such as \"see a feed\", \"like a post\", \"send a message\". **Non-functional**: how well it must work, such as \"opens in under 2 seconds\", \"works offline\", \"messages arrive within a second\". Non-functional requirements usually drive the interesting design decisions."]),
  S('Designing the API you need', [
    "List the endpoints the app needs and their shape. Use **cursor-based pagination** for feeds: the server returns a cursor that marks where the page ended, and you send it to get the next page. Offset pagination (`page=3`) breaks when new items are added, causing duplicates or missed items."],
    code=('Sending a message safely', '''POST /v1/chats/{chatId}/messages
Idempotency-Key: 3f2a-...           # client-generated, same key on retry
{ "clientId": "m_local_81", "text": "Hi!", "sentAt": 1729500000000 }

201 { "id": "m_9921", "clientId": "m_local_81", "serverTime": 1729500000123 }
# The app matches clientId to replace its local pending message''', 'text')),
  S('Real-time options', [
    "**Polling**: simple, but wasteful and slow to update. **Long polling**: the server holds the request until there is news. **Server-Sent Events**: a one-way stream from server to app. **WebSocket**: two-way and low latency, best for chat, but you must handle reconnects. **FCM push**: wakes the app when it is in the background."]),
 ],
 mistakes=[('Using page numbers for an infinite feed', 'Use cursors so new posts do not cause duplicates.'),
           ('Retrying POST requests without idempotency', 'Send an idempotency key so duplicates are ignored.'),
           ('Choosing WebSockets for everything', 'Use them only where real-time two-way traffic is needed.')],
 qa=('Why is cursor-based pagination better than offset pagination for a feed?',
     "With offset pagination, if new posts are added at the top while the user scrolls, every item shifts down and the next page repeats items the user already saw, or skips some on deletion. A cursor marks an exact position, such as the last item's ID and timestamp, so the next page always continues from the right place.")),

X([S('Draw the big picture', [
    "Start with boxes: UI (screens and ViewModels), domain (optional use cases), data (repositories), local storage (Room), remote (Retrofit API, WebSocket), background work (WorkManager), and shared services (image loader, analytics, auth). Draw arrows for how data moves. Interviewers love a clear diagram."]),
  S('Show the data flow', [
    "The key arrow is **network → database → UI**. The UI observes the database, the repository refreshes it from the network, and background jobs sync changes. This one decision handles offline mode, rotation, process death and consistency all at once."],
    code=('A feed architecture in text', '''FeedScreen (Compose)
   ↑ state            ↓ events
FeedViewModel  --  collects Flow<PagingData<Post>>
   ↓
FeedRepository
   ├── Pager + RemoteMediator ──► FeedApi (Retrofit, cursor pages)
   └── PostDao (Room) ◄── writes pages, UI reads from here
ImageLoader (Coil: memory + disk cache)
SyncWorker (WorkManager): likes/comments outbox''', 'text')),
  S('Paging 3 in one paragraph', [
    "A `PagingSource` loads pages from one place (for example the database). A `RemoteMediator` fetches new pages from the network when the database runs out and saves them into the database. The `Pager` connects them and exposes a `Flow<PagingData>` that lists in Compose or RecyclerView consume, loading more as the user scrolls."]),
 ],
 mistakes=[('UI reading straight from the network', 'Route network data through the database.'),
           ('Listing libraries without explaining roles', 'Explain what each box is responsible for.'),
           ('Forgetting images in a feed design', 'Discuss image sizes, caching and prefetching.')],
 qa=('Why route network data through the local database instead of showing it directly?',
     "It gives one source of truth, so every screen shows the same data. The app works offline and survives process death without refetching. Updates from any source, such as refresh, sync or user edits, flow to the UI automatically, and it makes pagination and caching simpler with tools like Paging's RemoteMediator.")),

X([S('Optimistic updates', [
    "When the user likes a post, show the like instantly instead of waiting for the server. Save the change locally, update the UI, and send it in the background. If the server rejects it, roll back and tell the user. This makes the app feel fast even on slow networks."]),
  S('The sync engine', [
    "A sync has two directions. **Push**: send local pending changes (the outbox) to the server, oldest first, with idempotency keys. **Pull**: ask the server for everything changed since your last sync token and write it into the database. Run sync on app open, when the network returns, and on a schedule with WorkManager."],
    code=('Pull changes since the last token', '''suspend fun pull() {
    var token = syncPrefs.lastToken()
    do {
        val page = api.changes(since = token, limit = 200)
        db.withTransaction {
            dao.upsert(page.updated.map(Dto::toEntity))
            dao.deleteIds(page.deletedIds)
        }
        token = page.nextToken
        syncPrefs.saveToken(token)          // resume from here if killed
    } while (page.hasMore)
}''')),
  S('Real-time in the foreground and background', [
    "For chat, keep a WebSocket open while the app is visible and reconnect with backoff when it drops. In the background, rely on FCM high-priority messages to notify the user. When the app opens again, run a catch-up sync from the last known message, in case some events were missed."]),
 ],
 mistakes=[('Keeping a WebSocket open in the background', 'Close it when the app is hidden; use FCM in the background.'),
           ('No plan for rejected optimistic updates', 'Roll back the local change and show a clear message.'),
           ('Syncing everything from scratch every time', 'Use a sync token to fetch only changes.')],
 qa=('How would you make sure no chat messages are lost if the WebSocket disconnects?',
     "Every message has a server sequence number or timestamp, and the app stores the last one it received. On reconnect, or when the app opens, it asks the server for all messages after that point before resuming the live stream. Outgoing messages sit in a local outbox with client IDs and idempotency keys until the server confirms them.")),

X([S('The non-functional checklist', [
    "**Performance**: image sizes, list efficiency, startup. **Battery and data**: batching, constraints, caching. **Security**: token storage, HTTPS, pinning, no secrets in the app. **Reliability**: retries, offline, process death. **Observability**: crash reporting, logs, performance traces, analytics. **Release safety**: feature flags, staged rollouts, kill switches."]),
  S('Scaling the app and the team', [
    "As the app grows: split it into feature modules, keep shared design system components, add remote config for quick changes without a release, and set up CI with tests and benchmarks. Mentioning these shows you think beyond the first version."]),
  S('Talking about trade-offs', [
    "For each big choice, say what you gain, what it costs, and when you would choose differently. For example: a WebSocket gives instant messages but costs battery and reconnection complexity; polling is simpler but slower. Interviewers remember candidates who name the costs of their own choices."],
    code=('Wrapping up in the last five minutes', '''1. Recap the design in 3 sentences
2. Name the riskiest part and how you would de-risk it
3. List what you would measure after launch (crash rate, feed load p90, sync success)
4. Mention the next improvements (prefetching, smarter caching, offline posting)''', 'text')),
 ],
 mistakes=[('Ending without a summary', 'Recap the design and the key trade-offs.'),
           ('Ignoring monitoring and rollout', 'Explain how you would know it works in production.'),
           ('Claiming the design has no downsides', 'Name the costs and when you would change your choice.')],
 qa=('How would you know your feed design works well after launch?',
     "I would track client metrics: time to first feed content, scroll jank and frame time, image load times, error and retry rates per endpoint, crash and ANR rates, and how often users see stale or empty states. I would roll out behind a feature flag in stages and compare these metrics against the old version before going to 100%.")),
]
