from decimal import Decimal

from sqlalchemy import select

from .models import Category, MenuItem


def seed_menu(session):
    # Existing categories are the durable first-run marker. Never overwrite admin edits.
    if session.scalar(select(Category.id).limit(1)):
        return
    catalog = {
        'Small plates': [
            ('Garden bruschetta', 'Toasted sourdough, ripe tomatoes, basil & a little extra virgin olive oil.', '8.50', '🍅', True),
            ('Crispy golden fries', 'Hand-cut potatoes, rosemary salt & our house garlic dip.', '6.00', '🍟', True),
        ],
        'Mains': [
            ('The Gather burger', 'Grilled beef, aged cheddar, crisp lettuce & house sauce on a toasted bun.', '16.00', '🍔', False),
            ('Wild mushroom pasta', 'Silky cream, roasted mushrooms, parmesan & fresh garden herbs.', '17.50', '🍝', True),
            ('Harvest grain bowl', 'Quinoa, roasted seasonal vegetables, avocado & lemon tahini.', '14.00', '🥗', True),
            ('Wood-fired margherita', 'San Marzano tomatoes, fresh mozzarella & hand-torn basil.', '15.00', '🍕', True),
        ],
        'Sweet endings': [
            ('Chocolate brownie', 'Warm dark chocolate brownie, vanilla cream & a pinch of sea salt.', '8.00', '🍫', True),
            ('Berry cheesecake', 'Baked vanilla cheesecake with a bright seasonal berry compote.', '9.00', '🍰', True),
        ],
        'Drinks': [
            ('House lemonade', 'Freshly squeezed lemons, a touch of sweetness & plenty of sunshine.', '5.00', '🍋', True),
            ('Iced oat latte', 'Double espresso, creamy oat milk & ice. Your afternoon, sorted.', '5.50', '☕', True),
        ],
    }
    for name, dishes in catalog.items():
        category = Category(name=name)
        session.add(category)
        session.flush()
        for title, description, price, icon, vegetarian in dishes:
            session.add(MenuItem(category_id=category.id, name=title, description=description,
                                 price=Decimal(price), icon=icon, vegetarian=vegetarian))
    session.flush()
