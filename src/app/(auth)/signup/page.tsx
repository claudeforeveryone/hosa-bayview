import type { Metadata } from "next";
import { SignupForm } from "./form";

export const metadata: Metadata = { title: "Make an account" };

export default function Page() {
  return <SignupForm />;
}
