import importlib.util
from pathlib import Path

from bs4 import BeautifulSoup


SCRIPT = Path(__file__).resolve().parents[2] / "scripts/publish-womens-lower-division-stats.py"
SPEC = importlib.util.spec_from_file_location("womens_lower_stats", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def test_number_preserves_missing_values_and_numeric_types():
    assert MODULE.number("1,234") == 1234
    assert MODULE.number("27.5") == 27.5
    assert MODULE.number("—") is None
    assert MODULE.number("N/A") is None


def test_parse_table_preserves_source_fields_and_team_slug_without_athlete_id():
    html = """
    <table class="block-stats__stats-table"><thead><tr><th>Rank</th><th>Name</th><th>Team</th><th>G</th><th>PPG</th></tr></thead>
      <tbody><tr><td>1</td><td>Example Player</td><td><a href="/schools/example">Example</a></td><td>30</td><td>22.4</td></tr></tbody>
    </table>
    """
    parsed = MODULE.parse_table(BeautifulSoup(html, "html.parser"), "individual", "Points Per Game", "https://www.ncaa.com/stats/basketball-women/d2/current/individual/102")
    row = parsed["rows"][0]
    assert parsed["statistic"] == "points_per_game"
    assert row["rank"] == 1
    assert row["name"] == "Example Player"
    assert row["team"] == "Example"
    assert row["team_source_path"] == "/schools/example"
    assert row["ppg"] == 22.4
    assert row["source_fields"]["PPG"] == "22.4"
    assert "athlete_id" not in row


def test_selectors_only_accept_statistic_paths():
    html = """
    <select id="select-container-individual">
      <option>Select an Individual Statistic</option>
      <option value="/stats/basketball-women/d2/current/individual/102">Points Per Game</option>
      <option value="https://bad.example/stats">Bad</option>
    </select>
    """
    soup = BeautifulSoup(html, "html.parser")
    expected = [
        ("Points Per Game", "/stats/basketball-women/d2/current/individual/102")
    ]
    assert MODULE.selectors(soup, "individual") == expected


def test_capture_contract_includes_every_source_selector():
    html = """
    <select id="select-container-individual">
      <option value="/stats/basketball-women/d2/current/individual/102">Points Per Game</option>
      <option value="/stats/basketball-women/d2/current/individual/554">Double Doubles</option>
    </select>
    <select id="select-container-team">
      <option value="/stats/basketball-women/d2/current/team/1292">Bench Points Per Game</option>
      <option value="/stats/basketball-women/d2/current/team/269">Points</option>
    </select>
    """
    soup = BeautifulSoup(html, "html.parser")
    assert MODULE.statistics_to_capture(soup, "individual") == MODULE.selectors(soup, "individual")
    assert MODULE.statistics_to_capture(soup, "team") == MODULE.selectors(soup, "team")
    assert len(MODULE.statistics_to_capture(soup, "individual")) == 2
    assert len(MODULE.statistics_to_capture(soup, "team")) == 2
