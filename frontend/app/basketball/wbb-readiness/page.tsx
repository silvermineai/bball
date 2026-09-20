import WomensForecastReadiness from "../../_components/WomensForecastReadiness";

export const metadata = {
  title: "Women’s basketball forecast readiness",
  description: "Evidence gates for a separate women’s basketball forecast edition.",
};

export default function Page() {
  return <>
    <div className="page-title">
      <div className="eyebrow">Women&apos;s basketball · model accountability</div>
      <h1>Forecast readiness before game probabilities.</h1>
      <p>
        This desk shows whether source-native women&apos;s schedule and team-box
        inputs support a separately fitted, calibrated forecast. Missing inputs
        stay visible and men&apos;s model rows never fill the gap.
      </p>
    </div>
    <section className="section">
      <WomensForecastReadiness />
    </section>
  </>;
}
