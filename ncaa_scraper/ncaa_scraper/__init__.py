"""NCAA Basketball Scraper Package.

The public classes are loaded lazily. Lightweight operator commands such as
the publication freshness check only need the package namespace and should not
fail because an optional data-ingestion dependency is absent.
"""

from importlib import import_module

_LAZY_EXPORTS = {
    "GameScraper": (".scraper", "GameScraper"),
    "TeamScraper": (".scraper", "TeamScraper"),
    "SeasonScraper": (".scraper", "SeasonScraper"),
    "ShotChart": (".visualizations", "ShotChart"),
    "CourtPlotter": (".visualizations", "CourtPlotter"),
    "PlayerStats": (".stats", "PlayerStats"),
    "TeamStats": (".stats", "TeamStats"),
    "GameStats": (".stats", "GameStats"),
    "NCAAIngestor": (".ingest", "NCAAIngestor"),
}


def __getattr__(name: str):
    target = _LAZY_EXPORTS.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attribute = target
    value = getattr(import_module(module_name, __name__), attribute)
    globals()[name] = value
    return value

__version__ = "0.1.0"
__all__ = [
    "GameScraper",
    "TeamScraper", 
    "SeasonScraper",
    "ShotChart",
    "CourtPlotter",
    "PlayerStats",
    "TeamStats",
    "GameStats",
    "NCAAIngestor",
]
