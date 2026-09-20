"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  buildScopeHref,
  DIVISION_OPTIONS,
  GENDER_OPTIONS,
  isNavItemActive,
  SPORT_NAVIGATION,
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
  const [currentSearch, setCurrentSearch] = useState("");
  useEffect(() => {
    setCurrentSearch(window.location.search);
  }, [pathname]);
  const searchParams = new URLSearchParams(currentSearch);
  const currentSport = sportForPathname(pathname, searchParams.get("gender"));
  const config = SPORT_NAVIGATION[currentSport];
  const gender = selectedGender(searchParams.get("gender"));
  const division = selectedDivision(searchParams.get("division"));
  const publishedScope = config.available && gender === "men" && division === "1";

  // Keep unavailable gender/division selections on the scope gate. This
  // prevents a scope link from falling through to the default men's D1 data.
  const hrefWithScope = (href: string) => buildScopeHref(publishedScope ? href : config.home, currentSearch, gender, division);
  const scopeHref = (nextGender: Gender, nextDivision: Division) =>
    buildScopeHref(pathname, currentSearch, nextGender, nextDivision);

  return (
    <div className="sport-desk-nav" aria-label="Sport navigation">
      <div className="sport-switcher" role="tablist" aria-label="Choose a sport">
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
              {SPORT_NAVIGATION[sport].label}
            </Link>
          );
        })}
      </div>
      <div className="sport-desk-row">
        <nav className="sport-tabs" aria-label={`${config.label} sections`}>
          <Link
            href={hrefWithScope(config.home)}
            className={`sport-tab sport-tab-home${pathname === config.home || pathname === config.home.slice(0, -1) ? " is-active" : ""}`}
            aria-current={pathname === config.home || pathname === config.home.slice(0, -1) ? "page" : undefined}
          >
            Overview
          </Link>
          {config.items.map((item) => {
            const active = isNavItemActive(pathname, item);
            return (
              <Link
                key={item.label}
                href={hrefWithScope(item.href)}
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
          <div className="sport-scope-group" aria-label="Gender">
            {GENDER_OPTIONS.map((option) => (
              <Link
                key={option.value}
                href={scopeHref(option.value, division)}
                className={gender === option.value ? "is-selected" : ""}
                aria-current={gender === option.value ? "page" : undefined}
              >
                {option.label}
              </Link>
            ))}
          </div>
          <div className="sport-scope-group" aria-label="NCAA division">
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
          <strong>Archive status:</strong> Women's Basketball observed player, roster and schedule tables are available; predictions remain gated until a separate model is validated.
        </div>
      ) : currentSport === "football" ? (
        <div className="sport-availability" role="status">
          <strong>Football coverage:</strong> current archive is FBS/FCS; D2 and D3 selections are retained for future imports.
        </div>
      ) : null}
    </div>
  );
}
