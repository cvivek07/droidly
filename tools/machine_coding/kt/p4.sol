data class Page<T>(
    val items: List<T>,
    val currentPage: Int,
    val totalPages: Int,
    val hasNext: Boolean,
    val hasPrevious: Boolean
)

class PaginationManager<T>(
    private val allItems: List<T>,
    private val pageSize: Int
) {
    init { require(pageSize > 0) { "pageSize must be positive" } }

    private val totalPages = ceil(allItems.size / pageSize.toDouble()).toInt()

    fun getPage(pageNumber: Int): Page<T> {
        require(pageNumber in 1..totalPages) { "Page $pageNumber is out of range 1..$totalPages" }
        val start = (pageNumber - 1) * pageSize
        val end = minOf(start + pageSize, allItems.size)
        return Page(
            items = allItems.subList(start, end),
            currentPage = pageNumber,
            totalPages = totalPages,
            hasNext = pageNumber < totalPages,
            hasPrevious = pageNumber > 1
        )
    }

    fun nextPage(currentPage: Int): Page<T>? = if (currentPage < totalPages) getPage(currentPage + 1) else null

    fun previousPage(currentPage: Int): Page<T>? = if (currentPage > 1) getPage(currentPage - 1) else null
}
