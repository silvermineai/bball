"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  buildScopeHref,
  divisionAwareNavHref,
  divisionDeskHref,
  DIVISION_OPTIONS,
  isNavItemActive,
  SPORT_NAVIGATION,
  sportAvailabilityMessage,
  sportForPathname,
  type Division,
  type Gender,
} from "../_lib/sport-navigation";

function selectedGender(value: string | null): Gender {
  return value === "women" ? "women" : "men";
}

function selectedDivision(value: string | null): Division {
  return value === "2" || value === "3" ? value : "1";
}

export default function SportNavigation() {
  const pathname = usePathname() || "/";
  // Search params can change without the pathname changing (for example when
  // switching from men's to women's basketball or from D1 to D2). Reading
  // Next's reactive search params keeps the active tab and every generated
  // scope link aligned with the URL after those transitions.
  const searchParams = useSearchParams();
  const currentSearch = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const currentSport = sportForPathname(pathname, searchParams.get("gender"), searchParams.get("sport"));
  const config = SPORT_NAVIGATION[currentSport];
  // Men's and women's basketball are separate sport tabs. Football is a
  // men's archive, so normalize any manually-entered gender query before
  // generating scope links instead of carrying an invalid women’s football
  // URL through every sub-tab.
  const gender = currentSport === "football" ? "men" : selectedGender(searchParams.get("gender"));
  const division = selectedDivision(searchParams.get("division"));
  // Preserve every requested scope on every tab. Route-level scope boundaries
  // show the correct unavailable state instead of silently falling back to D1.
  const hrefWithScope = (href: string) => buildScopeHref(href, currentSearch, gender, division);
  const scopeHref = (nextGender: Gender, nextDivision: Division) =>
    buildScopeHref(pathname, currentSearch, nextGender, nextDivision);

  return (
    <div className="sport-desk-nav" aria-label="Sport navigation">
      <div className="sport-switcher" role="tablist" aria-label="Choose a sport">
        <span className="sport-switcher-heading" aria-hidden="true">Sport</span>
        {(Object.keys(SPORT_NAVIGATION) as Array<keyof typeof SPORT_NAVIGATION>).map((sport) => {
          const active = sport === currentSport;
          return (
            <Link
              key={sport}
              href={buildScopeHref(SPORT_NAVIGATION[sport].home, currentSearch, SPORT_NAVIGATION[sport].gender, division)}
              className={`sport-switcher-tab${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
              role="tab"
              aria-selected={active}
            >
              <span className="sport-switcher-tab-name">{SPORT_NAVIGATION[sport].label}</span>
              <span className="sport-switcher-tab-meta">
                {sport === "football" ? "Men's archive" : sport === "womens-basketball" ? "Women's" : "Men's"}
              </span>
            </Link>
          );
        })}
      </div>
      <div className="sport-desk-row">
        <nav className="sport-tabs" aria-label={`${config.label} sections`}>
          <span className="sport-sections-label" aria-hidden="true">Sections</span>
          <Link
            href={hrefWithScope(config.home)}
            className={`sport-tab sport-tab-home${pathname === config.home || pathname === config.home.slice(0, -1) ? " is-active" : ""}`}
            aria-current={pathname === config.home || pathname === config.home.slice(0, -1) ? "page" : undefined}
          >
            Overview
          </Link>
          {config.items.map((item) => {
            const active = isNavItemActive(pathname, item);
            const itemHref = item.label === "Division" ? divisionDeskHref(currentSport) : divisionAwareNavHref(currentSport, division, item);
            return (
              <Link
                key={item.label}
                href={hrefWithScope(itemHref)}
                className={`sport-tab${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
          <details className="sport-explore">
            <summary>Explore</summary>
            <div className="sport-explore-panel">
              <div className="sport-explore-heading">{config.label} desk</div>
              {config.explore.map((item) => (
                <Link key={item.label} href={hrefWithScope(item.href)}>
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
        </nav>
        <div className="sport-scope" aria-label={`${config.label} data scope`}>
          <span className="sport-scope-label">Scope</span>
          <span className="sport-scope-fixed" aria-label="Active sport edition">{config.label}</span>
          <div className="sport-scope-group" aria-label="Division">
            {DIVISION_OPTIONS.map((option) => (
              <Link
                key={option.value}
                href={scopeHref(gender, option.value)}
                className={division === option.value ? "is-selected" : ""}
                aria-current={division === option.value ? "page" : undefined}
              >
                {option.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
      {!config.available ? (
        <div className="sport-availability" role="status">
          <strong>Archive status:</strong> Women's Basketball observed player, roster and schedule tables are available with a separately validated forecast model.
        </div>
      ) : (currentSport === "football" || currentSport === "womens-basketball") ? (
        <div className="sport-availability" role="status">
          {sportAvailabilityMessage(currentSport, division)}
        </div>
      ) : null}
    </div>
  );
}
