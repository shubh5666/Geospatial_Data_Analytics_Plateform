"""The supported GeoJSON Polygon input; topology is validated by PostGIS."""

from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

Longitude = Annotated[float, Field(strict=True, ge=-180, le=180, allow_inf_nan=False)]
Latitude = Annotated[float, Field(strict=True, ge=-90, le=90, allow_inf_nan=False)]
Position = tuple[Longitude, Latitude]
LinearRing = Annotated[list[Position], Field(min_length=4, max_length=10_000)]


class PolygonGeometry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["Polygon"]
    coordinates: list[LinearRing] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_rings(self) -> Self:
        if sum(len(ring) for ring in self.coordinates) > 10_000:
            raise ValueError("A polygon may contain at most 10000 coordinate positions")
        for ring in self.coordinates:
            if ring[0] != ring[-1]:
                raise ValueError("Each polygon ring must end at its starting position")
        return self
