import { Header, Footer } from "@/components/layout";
import {
  Hero,
  Features,
  Process,
  Calculator,
  FAQ,
  CTA,
} from "@/components/marketing";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Features />
        <Process />
        <Calculator />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
