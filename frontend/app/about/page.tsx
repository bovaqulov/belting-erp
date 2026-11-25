// / (domen ildizi) va /app/about — tizim haqida ochiq tanishtiruv sahifasi.
import type { Metadata } from "next";

import About from "@/home/about";

export const metadata: Metadata = { title: "Belting", description: "Belting boshqaruv tizimi: bo'limlar va modullar" };

export default function AboutPage() {
  return <About />;
}
