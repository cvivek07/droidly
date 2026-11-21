sealed class OrderState {
    object Placed : OrderState()
    object Confirmed : OrderState()
    object Preparing : OrderState()
    object OutForDelivery : OrderState()
    object Delivered : OrderState()
    object Cancelled : OrderState()
}

sealed class OrderEvent {
    object Confirm : OrderEvent()
    object StartPreparing : OrderEvent()
    object Dispatch : OrderEvent()
    object MarkDelivered : OrderEvent()
    object Cancel : OrderEvent()
}

class OrderStateMachine(initialState: OrderState = OrderState.Placed) {
    var currentState: OrderState = initialState
        private set

    fun transition(event: OrderEvent): Boolean {
        val next: OrderState? = when (val s = currentState) {
            OrderState.Delivered, OrderState.Cancelled -> null                // terminal states
            else -> when (event) {
                OrderEvent.Cancel -> OrderState.Cancelled
                OrderEvent.Confirm -> if (s == OrderState.Placed) OrderState.Confirmed else null
                OrderEvent.StartPreparing -> if (s == OrderState.Confirmed) OrderState.Preparing else null
                OrderEvent.Dispatch -> if (s == OrderState.Preparing) OrderState.OutForDelivery else null
                OrderEvent.MarkDelivered -> if (s == OrderState.OutForDelivery) OrderState.Delivered else null
            }
        }
        if (next == null) return false
        currentState = next
        return true
    }

    fun getStatusDescription(): String = when (currentState) {
        is OrderState.Placed         -> "Order placed, awaiting confirmation"
        is OrderState.Confirmed      -> "Order confirmed by restaurant"
        is OrderState.Preparing      -> "Your food is being prepared 👨‍🍳"
        is OrderState.OutForDelivery -> "Out for delivery 🛵"
        is OrderState.Delivered      -> "Delivered! Enjoy your meal 🍱"
        is OrderState.Cancelled      -> "Order cancelled"
    }
}
