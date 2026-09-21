import WomensReadinessRouter from "../../_components/WomensReadinessRouter";

export const metadata = {
  title: "Women’s basketball forecast readiness",
  description: "Evidence gates for a separate women’s basketball forecast edition.",
};

export default function Page() {
  return <>
    <div className="page-title">
      <div className="eyebrow">Women&apos;s basketball · division desk</div>
      <h1>Division coverage and forecast readiness.</h1>
      <p>
        D1 opens the separately fitted forecast evidence. D2 and D3 open their
        source-native player and team tables with the intake gates that keep
        unsupported identities and statistics visible.
      </p>
    </div>
    <section className="section">
      <WomensReadinessRouter />
    </section>
  </>;
}
