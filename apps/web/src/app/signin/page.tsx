import type { Metadata } from "next";
import { SignInForm } from "@/app/signin/sign-in-form";

export const metadata: Metadata = {
  title: "Sign in · Learn AI",
};

export default function SignInPage() {
  return <SignInForm />;
}
