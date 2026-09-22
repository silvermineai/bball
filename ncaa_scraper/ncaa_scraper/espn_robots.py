"""Fail-closed robots policy checks for ESPN API captures.

ESPN's public web API hosts are separate origins from ``www.espn.com``.  A
robots response from one host therefore cannot establish permission for an
API request to another host.  Capture jobs call :func:`verify_robots_policy`
with the exact API URL before making any source request and retain the policy
receipt alongside their bounded capture receipt.
"""

from __future__ import annotations

import hashlib
from urllib.parse import urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

import requests

DEFAULT_USER_AGENT = "SilvermineResearch/1.0 (bball.silvermine.dev)"


class ESPNRobotsError(RuntimeError):
    """Raised when ESPN request permission cannot be established."""


def verify_robots_policy(
    url: str,
    user_agent: str = DEFAULT_USER_AGENT,
    timeout: tuple[int, int] = (5, 20),
) -> dict[str, object]:
    """Require a readable, permissive robots file for the exact API origin.

    A non-200 response, redirect, network failure, or disallow rule is an
    unknown or negative permission state and blocks the page request.  The
    returned digest makes the policy that authorized a capture reviewable.
    """
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.netloc or parts.username or parts.password:
        raise ESPNRobotsError("ESPN API URL must use HTTPS before robots verification")
    robots_url = urlunsplit((parts.scheme, parts.netloc, "/robots.txt", "", ""))
    try:
        response = requests.get(
            robots_url,
            headers={"User-Agent": user_agent, "Accept": "text/plain"},
            timeout=timeout,
            allow_redirects=False,
        )
    except requests.RequestException as exc:
        raise ESPNRobotsError("Cannot verify ESPN robots policy; no page requested") from exc
    if response.status_code != 200:
        raise ESPNRobotsError("Cannot verify ESPN robots policy; no page requested")
    body = response.content
    if not isinstance(body, bytes):
        body = str(getattr(response, "text", "")).encode("utf-8")
    policy = RobotFileParser()
    policy.parse(body.decode("utf-8", "replace").splitlines())
    if not policy.can_fetch(user_agent, url):
        raise ESPNRobotsError("ESPN robots.txt disallows this request; no page requested")
    crawl_delay = policy.crawl_delay(user_agent) or policy.crawl_delay("*")
    return {
        "robots_url": robots_url,
        "robots_status": response.status_code,
        "robots_sha256": hashlib.sha256(body).hexdigest(),
        "crawl_delay_seconds": float(crawl_delay) if crawl_delay is not None else None,
    }
