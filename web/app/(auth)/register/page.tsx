import { redirect } from "next/navigation";

// MobG uses team-provisioned accounts; public registration is outside this scope.
export default function RegisterPage() {
  redirect("/login");
}
