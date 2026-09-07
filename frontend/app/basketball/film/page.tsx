import fs from "node:fs";
import path from "node:path";
import FilmRoom, { type FilmTeam, type FilmVideo } from "./FilmRoom";

export const metadata = {
  title: "Basketball film room",
  description: "Official college basketball film and highlights, matched to programs for scouting review.",
};

export default function Page() {
  const film = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public/data/film.json"), "utf8"),
  ) as { videos: FilmVideo[] };
  const teams = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public/data/teams.json"), "utf8"),
  ) as { teams: FilmTeam[] };
  return <FilmRoom videos={film.videos} teams={teams.teams} />;
}
