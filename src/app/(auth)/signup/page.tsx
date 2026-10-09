import type { Metadata } from "next";
import { SignupForm } from "./form";

export const metadata: Metadata = { title: "Make an account" };

export default async function Page({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  return <SignupForm admin={sp.admin !== undefined} />;
}
