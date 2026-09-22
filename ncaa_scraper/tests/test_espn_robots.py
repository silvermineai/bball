from types import SimpleNamespace
from unittest.mock import patch

import pytest

from ncaa_scraper.espn_robots import ESPNRobotsError, verify_robots_policy


def response(status: int, body: bytes):
    return SimpleNamespace(status_code=status, content=body, text=body.decode())


def test_exact_api_origin_policy_returns_receipt_and_delay():
    body = b"User-agent: *\nAllow: /\nCrawl-delay: 1\n"
    with patch("ncaa_scraper.espn_robots.requests.get", return_value=response(200, body)) as get:
        policy = verify_robots_policy("https://site.web.api.espn.com/apis/site/v2/sports/football/college-football/summary")
    assert get.call_args.args[0] == "https://site.web.api.espn.com/robots.txt"
    assert policy["robots_status"] == 200
    assert policy["crawl_delay_seconds"] == 1.0
    assert isinstance(policy["robots_sha256"], str) and len(policy["robots_sha256"]) == 64


@pytest.mark.parametrize(
    "status,body",
    [(503, b""), (200, b"User-agent: *\nDisallow: /\n")],
)
def test_policy_fails_closed_before_api_request(status, body):
    with patch("ncaa_scraper.espn_robots.requests.get", return_value=response(status, body)):
        with pytest.raises(ESPNRobotsError, match="robots"):
            verify_robots_policy("https://site.web.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary")


def test_policy_rejects_non_https_or_credentials():
    for url in (
        "http://site.web.api.espn.com/apis/site/v2/summary",
        "https://user:pass@site.web.api.espn.com/apis/site/v2/summary",
    ):
        with pytest.raises(ESPNRobotsError, match="HTTPS"):
            verify_robots_policy(url)
