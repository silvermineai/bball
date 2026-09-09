import { redirect } from "next/navigation";

export const metadata = {
  title: "Basketball journal",
  description:
    "Game analysis, model explainers and recruiting research from The Coaching Annual.",
  alternates: { canonical: "/blog/" },
};

export default function Page() {
  redirect("/blog/");
}
