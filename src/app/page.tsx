import { Header, Footer } from "@/components/layout";
import {
  Hero,
  WhatWeDo,
  Features,
  Process,
  CommunityBenefits,
  FAQ,
  CTA,
} from "@/components/marketing";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <WhatWeDo />
        <Features />
        <Process />
        <CommunityBenefits />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
