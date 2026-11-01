import Hero from "./Hero";
import { CTA, Faq, Features, Footer, How, Nav, Pricing, Proof } from "./Sections";

// A full page reads top to bottom as an argument: promise, proof, how, price, doubts answered, ask again.
export default function App() {
  return (
    <div className="min-h-screen bg-page text-ink">
      <Nav />
      <Hero />
      <Proof />
      <Features />
      <How />
      <Pricing />
      <Faq />
      <CTA />
      <Footer />
    </div>
  );
}
