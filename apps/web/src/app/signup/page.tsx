import type { Metadata } from "next";
import { SignUpForm } from "@/app/signup/sign-up-form";

export const metadata: Metadata = {
  title: "Create account · Learn AI",
};

export default function SignUpPage() {
  return <SignUpForm />;
}
