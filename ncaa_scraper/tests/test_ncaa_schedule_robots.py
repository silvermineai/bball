from types import SimpleNamespace

import pytest

from ncaa_scraper.fetcher import NCAAFetchError, verify_robots_policy


class FakeSession:
    def __init__(self, response):
        self.response = response
        self.urls = []

    def get(self, url, **kwargs):
        self.urls.append((url, kwargs))
        return self.response


def test_schedule_api_requires_permissive_robots_before_page_requests():
    response = SimpleNamespace(
        status_code=200,
        text="User-agent: *\nAllow: /\nCrawl-delay: 1\n",
        content=b"User-agent: *\nAllow: /\nCrawl-delay: 1\n",
    )
    session = FakeSession(response)

    policy = verify_robots_policy(session, "https://sdataprod.ncaa.com/?meta=one", "SilvermineResearch/1.0")

    assert session.urls[0][0] == "https://sdataprod.ncaa.com/robots.txt"
    assert session.urls[0][1]["allow_redirects"] is False
    assert policy["robots_status"] == 200
    assert policy["crawl_delay_seconds"] == 1.0


@pytest.mark.parametrize(
    "response",
    [
        SimpleNamespace(status_code=500, text="", content=b""),
        SimpleNamespace(status_code=302, text="", content=b""),
        SimpleNamespace(status_code=200, text="User-agent: *\nDisallow: /\n", content=b"User-agent: *\nDisallow: /\n"),
    ],
)
def test_schedule_api_fails_closed_when_robots_cannot_be_verified(response):
    session = FakeSession(response)

    with pytest.raises(NCAAFetchError, match="robots"):
        verify_robots_policy(session, "https://sdataprod.ncaa.com/?meta=one", "SilvermineResearch/1.0")

    assert session.urls and session.urls[0][0].endswith("/robots.txt")


def test_schedule_api_rejects_a_successful_response_from_another_origin():
    response = SimpleNamespace(
        status_code=200,
        url="https://redirected.example/robots.txt",
        text="User-agent: *\nAllow: /\n",
        content=b"User-agent: *\nAllow: /\n",
    )
    session = FakeSession(response)

    with pytest.raises(NCAAFetchError, match="robots"):
        verify_robots_policy(session, "https://sdataprod.ncaa.com/?meta=one", "SilvermineResearch/1.0")

    assert session.urls[0][1]["allow_redirects"] is False
