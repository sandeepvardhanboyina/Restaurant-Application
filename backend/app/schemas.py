from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Login(Input):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=256)


class CategoryInput(Input):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class MenuInput(Input):
    category_id: int = Field(gt=0)
    name: Name
    description: str = Field(max_length=1000)
    price: Decimal = Field(gt=0, le=9999, max_digits=6, decimal_places=2)
    icon: str = Field(default='🍽️', min_length=1, max_length=12)
    vegetarian: bool = False
    available: bool = True


class CartLine(Input):
    menu_item_id: int = Field(gt=0)
    quantity: int = Field(ge=1, le=20)


class OrderInput(Input):
    request_id: UUID
    table_number: int = Field(ge=1, le=100)
    notes: str = Field(default='', max_length=500)
    items: list[CartLine] = Field(min_length=1, max_length=30)


class StatusInput(Input):
    status: Literal['pending', 'preparing', 'ready', 'served', 'cancelled']
