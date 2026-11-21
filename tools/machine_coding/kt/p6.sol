sealed class Discount {
    data class PercentageOff(val percentage: Double) : Discount()
    data class FlatDiscount(val amount: Double) : Discount()
    data class BuyXGetYFree(val buyQuantity: Int, val freeQuantity: Int) : Discount()
    object None : Discount()
}

data class CartItem(
    val productId: String,
    val name: String,
    val price: Double,
    val quantity: Int,
    val discount: Discount = Discount.None
)

class ShoppingCart {
    private val items = LinkedHashMap<String, CartItem>()

    fun addItem(item: CartItem) {
        val existing = items[item.productId]
        items[item.productId] = existing?.copy(quantity = existing.quantity + item.quantity) ?: item
    }

    fun removeItem(productId: String) { items.remove(productId) }

    fun calculateTotal(): Double = items.values.sumOf { lineTotal(it) - saving(it) }

    fun getAppliedDiscounts(): Map<String, Double> =
        items.values.associate { it.productId to saving(it) }.filterValues { it > 0.0 }

    private fun lineTotal(item: CartItem) = item.price * item.quantity

    private fun saving(item: CartItem): Double = when (val d = item.discount) {
        is Discount.PercentageOff -> lineTotal(item) * d.percentage / 100.0
        is Discount.FlatDiscount -> minOf(d.amount, lineTotal(item))          // never below zero
        is Discount.BuyXGetYFree -> {
            val group = d.buyQuantity + d.freeQuantity
            val freeUnits = (item.quantity / group) * d.freeQuantity
            freeUnits * item.price
        }
        Discount.None -> 0.0
    }
}
